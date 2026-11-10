// DB-level regression test for the M1 entitlement lock. Executes the REAL
// migration SQL on real Postgres (PGlite, WASM PG17) and probes it as
// `authenticated` vs `service_role`. The Supabase plane (roles, auth.uid(),
// auth.role(), grants) is emulated, not reproduced -- see the migration's
// "Verification status" paragraph. No network, Docker or credentials needed.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { after, before, beforeEach, describe, it } from "node:test";
import { PGlite } from "@electric-sql/pglite";

const MARKER = "supabase/migrations/20260813000000_weekly_session_transcripts.sql";
const FILES = [
  "supabase/migrations/20260813000000_weekly_session_transcripts.sql",
  "supabase/migrations/20260814000000_weekly_session_confirm_lock.sql",
  "supabase/migrations/20261110000000_weekly_session_transcripts_entitlement_lock.sql",
];

// No import.meta: walk up from cwd (npm test runs from the repo root).
function repoRoot(): string {
  let dir = process.cwd();
  for (;;) {
    if (existsSync(join(dir, MARKER))) return dir;
    const up = dirname(dir);
    if (up === dir) throw new Error(`repo root not found above ${process.cwd()}`);
    dir = up;
  }
}

const USER = "11111111-1111-1111-1111-111111111111";
const OTHER = "22222222-2222-2222-2222-222222222222";
const THIS_WEEK = "2026-11-08";
const LAST_WEEK = "2026-11-01";
const T = "public.weekly_session_transcripts";

type Result = {
  ok: boolean;
  rows: Record<string, unknown>[];
  count: number;
  code?: string;
  message?: string;
};
type Actor = "authenticated" | "service_role";

let db: PGlite;

// One statement as `role`, with the per-statement JWT GUCs Supabase sets.
async function asCaller(role: Actor, sql: string, sub = USER): Promise<Result> {
  await db.exec(`reset role; set session request.jwt.claim.role = '${role}';
    set session request.jwt.claim.sub = '${role === "service_role" ? "" : sub}'; set role ${role};`);
  try {
    const rows = (await db.query(sql)).rows as Record<string, unknown>[];
    return { ok: true, rows, count: rows.length };
  } catch (e) {
    const err = e as { code?: string; message?: string };
    return { ok: false, rows: [], count: 0, code: err.code, message: err.message };
  } finally {
    await db.exec("reset role;");
  }
}

function describeFailure(actor: Actor, sql: string, r: Result): string {
  return `actor=${actor}\n  sql=${sql.replace(/\s+/g, " ").trim()}\n  result=${
    r.ok ? `ok count=${r.count}` : `error code=${r.code} message=${r.message}`
  }`;
}

async function refused42501(actor: Actor, sql: string, sub = USER): Promise<Result> {
  const r = await asCaller(actor, sql, sub);
  assert.ok(!r.ok && r.code === "42501", `expected refused 42501\n  ${describeFailure(actor, sql, r)}`);
  return r;
}
async function refusedAny(actor: Actor, sql: string, sub = USER): Promise<Result> {
  const r = await asCaller(actor, sql, sub);
  assert.ok(!r.ok, `expected refused\n  ${describeFailure(actor, sql, r)}`);
  return r;
}
// "Allowed" means ok AND >= 1 row: an RLS-filtered UPDATE is ok with 0 rows.
async function allowed(actor: Actor, sql: string, sub = USER): Promise<Result> {
  const r = await asCaller(actor, sql, sub);
  assert.ok(r.ok && r.count >= 1, `expected allowed with count>=1\n  ${describeFailure(actor, sql, r)}`);
  return r;
}

const seed = async (sql: string): Promise<string> => {
  const r = await allowed("service_role", sql);
  return r.rows[0].id as string;
};
const seedRow = (week: string, extra = "", cols = "") =>
  seed(`insert into ${T} (user_id, week_start${cols ? ", " + cols : ""}) values ('${USER}','${week}'${extra ? ", " + extra : ""}) returning id`);
const readWeek = async (week: string) =>
  (
    await asCaller(
      "authenticated",
      `select week_start::text as week_start, completed_at,
              case when jsonb_typeof(active_state->'turns') = 'array' then jsonb_array_length(active_state->'turns') else -1 end as turns
         from ${T} where user_id = '${USER}' and week_start = '${week}'`,
    )
  ).rows;

describe("M1 entitlement lock: the gate's row key is not client-writable (real migration SQL on PGlite)", () => {
  before(async () => {
    const root = repoRoot();
    db = new PGlite();
    await db.exec(`
      create role authenticated nologin;
      create role service_role nologin bypassrls;
      create schema auth;
      create table auth.users (id uuid primary key);
      insert into auth.users (id) values ('${USER}'), ('${OTHER}');
      create function auth.uid() returns uuid language sql stable as $$
        select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''),
          (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'))::uuid $$;
      create function auth.role() returns text language sql stable as $$
        select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''),
          (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')) $$;
      grant usage on schema auth to authenticated, service_role;
      grant execute on function auth.uid(), auth.role() to authenticated, service_role;
    `);
    for (const f of FILES) await db.exec(readFileSync(join(root, f), "utf8"));
  });

  // Every test starts from an empty table (connected as superuser, so no RLS).
  beforeEach(async () => {
    await db.exec(`reset role; delete from ${T};`);
  });

  after(async () => {
    await db.close();
  });

  describe("controls: the emulated plane is live", () => {
    it("C1 authenticated INSERT with active_state turns is refused 42501", async () => {
      await refused42501(
        "authenticated",
        `insert into ${T} (user_id, week_start, active_state) values ('${USER}','${THIS_WEEK}','{"turns":[1]}'::jsonb) returning id`,
      );
    });
    it("C2 authenticated INSERT for another user_id is refused (RLS)", async () => {
      await refusedAny(
        "authenticated",
        `insert into ${T} (user_id, week_start) values ('${OTHER}','2026-11-02') returning id`,
      );
    });
    it("C3 authenticated UPDATE of another user's row is ok with 0 rows (RLS filtered)", async () => {
      const id = await seed(`insert into ${T} (user_id, week_start) values ('${OTHER}','2026-11-03') returning id`);
      const sql = `update ${T} set display_turns = '[1]'::jsonb where id = '${id}' returning id`;
      const r = await asCaller("authenticated", sql);
      assert.ok(r.ok && r.count === 0, `expected ok with 0 rows\n  ${describeFailure("authenticated", sql, r)}`);
    });
    it("C4 authenticated INSERT shaped like tryBeginConfirm is allowed, 1 row", async () => {
      const r = await allowed(
        "authenticated",
        `insert into ${T} (user_id, week_start, confirming_at, updated_at) values ('${USER}','2026-11-20', now(), now()) returning id`,
      );
      assert.equal(r.count, 1);
    });
    it("C5 authenticated UPDATE flipping user_id on its OWN row is refused", async () => {
      const id = await seedRow(THIS_WEEK);
      await refusedAny("authenticated", `update ${T} set user_id = '${OTHER}' where id = '${id}' returning id`);
    });
  });

  describe("attacks on the row key (RED before the widened trigger)", () => {
    it("R1 direct retarget: completed row from last week -> this week is refused 42501, this week stays absent", async () => {
      await seedRow(LAST_WEEK, "now()", "completed_at");
      await refused42501(
        "authenticated",
        `update ${T} set week_start = '${THIS_WEEK}' where user_id = '${USER}' and week_start = '${LAST_WEEK}' returning id`,
      );
      assert.deepEqual(await readWeek(THIS_WEEK), [], "this week's row must still be absent");
    });

    it("R2 two-step: park the occupying row (refused 42501), then retarget the in-progress row (refused 42501)", async () => {
      await seedRow(THIS_WEEK);
      const prog = await seedRow("2026-10-11", `'{"turns":[{"c":"a"},{"c":"b"}]}'::jsonb`, "active_state");
      await refused42501(
        "authenticated",
        `update ${T} set week_start = '2099-01-01' where user_id = '${USER}' and week_start = '${THIS_WEEK}' returning id`,
      );
      await refused42501(
        "authenticated",
        `update ${T} set week_start = '${THIS_WEEK}' where id = '${prog}' returning id`,
      );
      const rows = await readWeek(THIS_WEEK);
      assert.ok(
        rows.every((r) => r.turns === 0 && r.completed_at === null),
        `no turns may land on this week: ${JSON.stringify(rows)}`,
      );
    });

    it("R3 in-progress row (2 turns) -> free current-week slot is refused 42501, this week has no turns", async () => {
      const prog = await seedRow("2026-10-11", `'{"turns":[{"c":"a"},{"c":"b"}]}'::jsonb`, "active_state");
      await refused42501(
        "authenticated",
        `update ${T} set week_start = '${THIS_WEEK}' where id = '${prog}' returning id`,
      );
      const rows = await readWeek(THIS_WEEK);
      assert.ok(
        rows.length === 0 || rows.every((r) => r.turns === 0 && r.completed_at === null),
        `this week must have no row or an empty one: ${JSON.stringify(rows)}`,
      );
    });

    it("R4a UPSERT DO UPDATE SET week_start is refused 42501 and the key is unchanged", async () => {
      await seedRow(LAST_WEEK);
      await refused42501(
        "authenticated",
        `insert into ${T} (user_id, week_start) values ('${USER}','${LAST_WEEK}')
           on conflict (user_id, week_start) do update set week_start = '${THIS_WEEK}' returning id`,
      );
      assert.equal((await readWeek(LAST_WEEK)).length, 1, "row must still be at its original week_start");
      assert.deepEqual(await readWeek(THIS_WEEK), []);
    });

    it("R4b UPSERT DO UPDATE SET user_id is refused", async () => {
      await seedRow(LAST_WEEK);
      await refusedAny(
        "authenticated",
        `insert into ${T} (user_id, week_start) values ('${USER}','${LAST_WEEK}')
           on conflict (user_id, week_start) do update set user_id = '${OTHER}' returning id`,
      );
      assert.equal((await readWeek(LAST_WEEK)).length, 1, "row must still belong to its original user");
    });

    it("R5 retarget carrying display_turns along is refused 42501", async () => {
      const id = await seedRow(LAST_WEEK, "now()", "completed_at");
      await refused42501(
        "authenticated",
        `update ${T} set week_start = '${THIS_WEEK}', display_turns = '[]'::jsonb where id = '${id}' returning id`,
      );
      assert.deepEqual(await readWeek(THIS_WEEK), []);
    });
  });

  describe("legitimate writers still pass (no false positives)", () => {
    it("G1 no-op UPDATE assigning week_start = week_start and user_id = user_id is allowed", async () => {
      const id = await seedRow(THIS_WEEK);
      await allowed(
        "authenticated",
        `update ${T} set week_start = week_start, user_id = user_id where id = '${id}' returning id`,
      );
    });
    it("G2 savePendingProposal shape is allowed", async () => {
      const id = await seedRow(THIS_WEEK);
      await allowed(
        "authenticated",
        `update ${T} set pending_proposed = '[]'::jsonb, pending_session_actions = '[]'::jsonb, updated_at = now() where id = '${id}' returning id`,
      );
    });
    it("G3 clearConfirmingAt shape is allowed", async () => {
      const id = await seedRow(THIS_WEEK, "now()", "confirming_at");
      await allowed(
        "authenticated",
        `update ${T} set confirming_at = null, updated_at = now() where id = '${id}' returning id`,
      );
    });
    it("G4 tryBeginConfirm update shape is allowed", async () => {
      const id = await seedRow(THIS_WEEK);
      await allowed(
        "authenticated",
        `update ${T} set confirming_at = now(), updated_at = now() where id = '${id}' returning id`,
      );
    });
    it("G5 /step shape (display_turns + actions_so_far + updated_at) is allowed", async () => {
      const id = await seedRow(THIS_WEEK);
      await allowed(
        "authenticated",
        `update ${T} set display_turns = '[{"from":"user","text":"hi"}]'::jsonb, actions_so_far = '[]'::jsonb, updated_at = now() where id = '${id}' returning id`,
      );
    });
    it("G6 service_role UPDATE of active_state + completed_at is allowed, 1 row", async () => {
      const id = await seedRow(THIS_WEEK);
      const r = await allowed(
        "service_role",
        `update ${T} set active_state = '{"turns":[1,2]}'::jsonb, completed_at = now() where id = '${id}' returning id`,
      );
      assert.equal(r.count, 1);
    });
    it("G7 service_role upsert on (user_id, week_start) bumping active_state is allowed", async () => {
      await seedRow(THIS_WEEK);
      await allowed(
        "service_role",
        `insert into ${T} (user_id, week_start, active_state) values ('${USER}','${THIS_WEEK}','{"turns":[]}'::jsonb)
           on conflict (user_id, week_start) do update set active_state = excluded.active_state, completed_at = now() returning id`,
      );
    });
    it("G8 authenticated DELETE of its own row is refused (no delete grant)", async () => {
      const id = await seedRow(THIS_WEEK);
      await refusedAny("authenticated", `delete from ${T} where id = '${id}' returning id`);
    });
  });
});
