import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MAX_REVISE_ACTIONS, MAX_REVISE_MESSAGE_LENGTH, runRevisePlan } from "./route";
import { LLM_SPEND_HOURLY_LIMIT, spendLimitBody } from "@/lib/llm/spendGuard";
import type { createClient } from "@/lib/supabase/server";
import type { revisePlan } from "@/lib/engine/revisePlan";

type Supabase = Awaited<ReturnType<typeof createClient>>;

const action = {
  role: "Health",
  description: "Run",
  type: "habit",
  cadenceCount: 3,
  preferredTime: "06:00",
};

function actions(n: number) {
  return Array.from({ length: n }, () => ({ ...action }));
}

// Fake supabase driving the real spend guard: llm_call_events counts come from
// an in-memory list of timestamps; every insert and every revisePlan call goes
// into one shared ordered log. The transcript is a completed week, so the
// free-tier gate short-circuits without a billing lookup.
function setup(preseeded = 0) {
  const calls: string[] = [];
  const inserts: Array<Record<string, unknown>> = [];
  const events: string[] = Array.from({ length: preseeded }, () => new Date().toISOString());
  let reviseCalls = 0;
  const transcript = {
    completed_at: new Date().toISOString(),
    active_state: { turns: [] },
  };
  const supabase = {
    from(table: string) {
      if (table === "weekly_session_transcripts") {
        const chain = {
          select: () => chain,
          eq: () => chain,
          maybeSingle: async () => ({ data: transcript, error: null }),
        };
        return chain;
      }
      let since = "";
      const chain = {
        select: () => chain,
        eq: () => chain,
        gte: (_c: string, v: string) => {
          since = v;
          return chain;
        },
        insert: async (row: Record<string, unknown>) => {
          calls.push("insert");
          inserts.push(row);
          events.push(new Date().toISOString());
          return { error: null };
        },
        then: (resolve: (v: unknown) => void) =>
          resolve({ count: events.filter((e) => e >= since).length, error: null }),
      };
      return chain;
    },
  } as unknown as Supabase;
  const result = { reply: "Moved the run to Saturday.", actions: actions(3) };
  const stub = (async () => {
    calls.push("revisePlan");
    reviseCalls++;
    return result;
  }) as unknown as typeof revisePlan;
  return { supabase, calls, inserts, result, stub, reviseCalls: () => reviseCalls };
}

function run(s: ReturnType<typeof setup>, body: unknown) {
  return runRevisePlan({
    supabase: s.supabase,
    user: { id: "user-a" },
    body,
    revisePlan: s.stub,
  });
}

describe("runRevisePlan", () => {
  it("The N+1th revise call by the same user inside the window returns 429 without calling Anthropic", async () => {
    const s = setup();
    const body = { message: "Move the run to Saturday", actions: actions(3) };
    let calls = 0;
    let res = await run(s, body);
    calls++;
    while (res.status !== 429 && calls < LLM_SPEND_HOURLY_LIMIT + 5) {
      res = await run(s, body);
      calls++;
    }
    assert.equal(res.status, 429);
    assert.equal(calls, LLM_SPEND_HOURLY_LIMIT + 1);
    assert.equal(res.body.code, "llm_rate_limited");
    assert.deepEqual(res.body, spendLimitBody({ hourly: LLM_SPEND_HOURLY_LIMIT, daily: LLM_SPEND_HOURLY_LIMIT }));
    assert.equal(s.reviseCalls(), 200);
    assert.equal(s.inserts.length, 200);
  });

  it("A revise body with message over the cap or more than the max actions returns 400", async () => {
    const longMsg = setup();
    const r1 = await run(longMsg, {
      message: "x".repeat(MAX_REVISE_MESSAGE_LENGTH + 1),
      actions: actions(3),
    });
    assert.equal(r1.status, 400);
    assert.equal(longMsg.reviseCalls(), 0);

    const manyActions = setup();
    const r2 = await run(manyActions, {
      message: "Move the run",
      actions: actions(MAX_REVISE_ACTIONS + 1),
    });
    assert.equal(r2.status, 400);
    assert.equal(manyActions.reviseCalls(), 0);
  });

  it("400s an over-long message without calling revisePlan or reserving a spend row", async () => {
    const s = setup();
    const res = await run(s, { message: "x".repeat(2001), actions: actions(3) });
    assert.equal(res.status, 400);
    assert.equal(
      res.body.error,
      `Message is too long — keep it under ${MAX_REVISE_MESSAGE_LENGTH} characters.`,
    );
    assert.equal(s.reviseCalls(), 0);
    assert.equal(s.inserts.length, 0);
  });

  it("400s 51 actions without calling revisePlan", async () => {
    const s = setup();
    const res = await run(s, { message: "Move the run", actions: actions(51) });
    assert.equal(res.status, 400);
    assert.equal(
      res.body.error,
      `Too many actions — a revision can handle at most ${MAX_REVISE_ACTIONS} actions.`,
    );
    assert.equal(s.reviseCalls(), 0);
    assert.equal(s.inserts.length, 0);
  });

  it("accepts exactly the max message length and the max action count", async () => {
    const s = setup();
    const res = await run(s, {
      message: "x".repeat(MAX_REVISE_MESSAGE_LENGTH),
      actions: actions(MAX_REVISE_ACTIONS),
    });
    assert.equal(res.status, 200);
    assert.equal(s.reviseCalls(), 1);
  });

  it("429s on the first attempt when the hour is already full, writing nothing", async () => {
    const s = setup(LLM_SPEND_HOURLY_LIMIT);
    const res = await run(s, { message: "Move the run", actions: actions(3) });
    assert.equal(res.status, 429);
    assert.equal(res.body.code, "llm_rate_limited");
    assert.equal(s.reviseCalls(), 0);
    assert.equal(s.inserts.length, 0);
  });

  it("returns the revision and reserves the spend row before calling revisePlan", async () => {
    const s = setup();
    const res = await run(s, { message: "Move the run to Saturday", actions: actions(3) });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, s.result);
    assert.deepEqual(s.calls, ["insert", "revisePlan"]);
    assert.equal(s.inserts[0].route, "weekly-session/revise");
  });
});
