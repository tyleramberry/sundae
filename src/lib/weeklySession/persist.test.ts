import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createWeeklyItems,
  fingerprintProposed,
  classifiedActionsFromWeeklyItems,
  toDateOnly,
  saveWeeklySessionTranscript,
  recordWeeklySessionConfirmed,
} from "./persist";
import { planningWeekStart } from "./week";
import type { SupabaseClient } from "@supabase/supabase-js";

describe("toDateOnly", () => {
  it("keeps local midnight on the same calendar date", () => {
    const sunday = new Date(2026, 7, 9, 0, 0, 0, 0);
    assert.equal(toDateOnly(sunday), "2026-08-09");
  });
});

describe("fingerprintProposed", () => {
  it("is stable for the same plan and changes when a block moves", () => {
    const a = [
      {
        role: "Founder",
        description: "Write the update",
        type: "goal" as const,
        blocks: [{ start: "2026-08-10T15:00:00.000Z", end: "2026-08-10T15:45:00.000Z" }],
      },
    ];
    const moved = [
      {
        ...a[0],
        blocks: [{ start: "2026-08-10T16:00:00.000Z", end: "2026-08-10T16:45:00.000Z" }],
      },
    ];
    assert.equal(fingerprintProposed(a), fingerprintProposed(a));
    assert.notEqual(fingerprintProposed(a), fingerprintProposed(moved));
  });
});

describe("classifiedActionsFromWeeklyItems", () => {
  it("collapses cadence rows and keeps one-off goals", () => {
    const actions = classifiedActionsFromWeeklyItems([
      { role: "Athlete", type: "habit", title: "Run" },
      { role: "Athlete", type: "habit", title: "Run" },
      { role: "Founder", type: "goal", title: "Send the update" },
    ]);
    assert.equal(actions.length, 2);
    const run = actions.find((a) => a.description === "Run");
    assert.equal(run?.cadenceCount, 2);
    assert.equal(actions.find((a) => a.description === "Send the update")?.type, "goal");
  });
});

// A fake Supabase that records the rows handed to weekly_items.insert, so a
// test can assert how many rows a given action fans out into.
function fakeSupabase(inserted: unknown[]): SupabaseClient {
  return {
    from: (table: string) => {
      assert.equal(table, "weekly_items");
      return {
        insert: async (rows: unknown[]) => {
          inserted.push(...rows);
          return { error: null };
        },
      };
    },
  } as unknown as SupabaseClient;
}

describe("createWeeklyItems cadence clamp", () => {
  const habit = (cadenceCount: number) => ({
    role: "Athlete",
    description: "Run",
    type: "habit" as const,
    cadenceCount,
    blocks: [],
    eventIds: [],
  });

  it("caps a direct cadenceCount of 1e9 at 7 rows", async () => {
    const insertedRows: Record<string, unknown>[] = [];
    // Constructed directly, deliberately bypassing the validator.
    const count = await createWeeklyItems(
      fakeSupabase(insertedRows),
      "user-1",
      new Date(2026, 7, 10),
      [habit(1e9)],
    );
    assert.equal(insertedRows.length, 7);
    assert.equal(count, 7);
    for (const row of insertedRows) {
      assert.equal(row.type, "habit");
      assert.equal(row.google_event_id, null);
    }
  });

  it("cadenceCount 3 still creates 3 rows", async () => {
    const insertedRows: Record<string, unknown>[] = [];
    const count = await createWeeklyItems(
      fakeSupabase(insertedRows),
      "user-1",
      new Date(2026, 7, 10),
      [habit(3)],
    );
    assert.equal(insertedRows.length, 3);
    assert.equal(count, 3);
  });
});

// Records every from(table) call and the insert/update/upsert payload it got,
// so tests can tell which client a write landed on.
type RecordedCall = { table: string; op: string; payload?: Record<string, unknown> };
function recordingClient(existingRow: Record<string, unknown> | null = null) {
  const calls: RecordedCall[] = [];
  const client = {
    from(table: string) {
      const chain: Record<string, unknown> = {
        select: () => chain,
        eq: () => chain,
        is: () => chain,
        maybeSingle: async () => {
          calls.push({ table, op: "maybeSingle" });
          return { data: existingRow ?? null, error: null };
        },
        insert: async (payload: Record<string, unknown>) => {
          calls.push({ table, op: "insert", payload });
          return { error: null };
        },
        upsert: async (payload: Record<string, unknown>) => {
          calls.push({ table, op: "upsert", payload });
          return { error: null };
        },
        update: (payload: Record<string, unknown>) => {
          calls.push({ table, op: "update", payload });
          return chain;
        },
        then: (resolve: (v: unknown) => void) => resolve({ data: null, error: null }),
      };
      return chain;
    },
  } as unknown as SupabaseClient;
  return { client, calls };
}

const writesWith = (calls: RecordedCall[], key: string) =>
  calls.filter((c) => c.payload && key in c.payload);

describe("saveWeeklySessionTranscript write client", () => {
  it("hands active_state to transcriptWriter and never to the session client", async () => {
    const session = recordingClient(null);
    const writer = recordingClient(null);
    await saveWeeklySessionTranscript(session.client, {
      userId: "user-1",
      weekStart: "2026-11-08",
      displayTurns: [],
      activeState: { turns: [{ role: "user", content: "hi" }] } as never,
      actionsSoFar: [],
      expectedRoundSeq: 0,
      transcriptWriter: writer.client,
    });
    const written = writesWith(writer.calls, "active_state");
    assert.equal(written.length, 1);
    assert.equal(written[0].op, "insert");
    assert.equal(written[0].table, "weekly_session_transcripts");
    assert.equal(writesWith(session.calls, "active_state").length, 0);
    assert.equal(session.calls.filter((c) => c.op !== "maybeSingle").length, 0);
  });
});

describe("recordWeeklySessionConfirmed write client", () => {
  it("writes the upsert and the completed_at update through transcriptWriter only", async () => {
    const session = recordingClient(null);
    const writer = recordingClient(null);
    const result = await recordWeeklySessionConfirmed(session.client, {
      userId: "user-1",
      weekStart: "2026-11-08",
      confirmationMessage: "done",
      fingerprint: "fp",
      transcriptWriter: writer.client,
    });
    assert.equal(result.isFirstConfirmThisWeek, true);
    const upserts = writer.calls.filter((c) => c.op === "upsert");
    assert.equal(upserts.length, 1);
    assert.deepEqual(upserts[0].payload?.active_state, { turns: [] });
    assert.equal(writesWith(writer.calls, "completed_at").length, 1);
    assert.equal(writer.calls.filter((c) => c.op === "update").length, 1);
    assert.equal(session.calls.filter((c) => c.op !== "maybeSingle").length, 0);
    assert.equal(writesWith(session.calls, "active_state").length, 0);
    assert.equal(writesWith(session.calls, "completed_at").length, 0);
  });
});

describe("createWeeklyItems timeZone", () => {
  it("places rows in the week of the request's timezone, not the process zone's", async () => {
    // 2026-11-12T12:00Z is Thursday in the Americas / UTC (current week,
    // 2026-11-08) but already Friday 01:00 in Auckland (plan next week,
    // 2026-11-15). Deterministic: a fixed instant, no wall clock.
    const instant = new Date("2026-11-12T12:00:00.000Z");
    const tz = "Pacific/Auckland";
    const zoneWeek = planningWeekStart(instant, tz);
    const processWeek = planningWeekStart(instant);
    assert.equal(zoneWeek, "2026-11-15");
    assert.notEqual(
      zoneWeek,
      processWeek,
      "precondition: this machine's zone must disagree with Auckland for this instant",
    );

    const insertedRows: Record<string, unknown>[] = [];
    await createWeeklyItems(
      fakeSupabase(insertedRows),
      "user-1",
      instant,
      [{ role: "Athlete", description: "Run", type: "project" as const, blocks: [], eventIds: [] }],
      tz,
    );
    assert.equal(insertedRows[0].week_start, zoneWeek);
    assert.notEqual(insertedRows[0].week_start, processWeek);
  });
});
