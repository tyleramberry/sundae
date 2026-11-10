import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createWeeklyItems,
  fingerprintProposed,
  classifiedActionsFromWeeklyItems,
  toDateOnly,
} from "./persist";
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
