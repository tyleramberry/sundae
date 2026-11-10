import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  LLM_SPEND_LIMIT_CODE,
  enforceLlmSpend,
  isOverSpendLimit,
  spendLimitBody,
  spendWindowStarts,
} from "./spendGuard";

// Chainable stub over from("llm_call_events"). The two count queries are told
// apart by the age of their `gte` argument relative to the injected `now`:
// within 90 minutes is the hourly window, anything older is the daily one.
function fakeSupabase(now: Date, counts: { hourly: number; daily: number }) {
  const gteArgs: string[] = [];
  const inserts: Array<Record<string, unknown>> = [];
  const supabase = {
    from(table: string) {
      assert.equal(table, "llm_call_events");
      let windowStart = "";
      const chain = {
        select: () => chain,
        eq: () => chain,
        gte: (_col: string, value: string) => {
          windowStart = value;
          gteArgs.push(value);
          return chain;
        },
        insert: async (row: Record<string, unknown>) => {
          inserts.push(row);
          return { error: null };
        },
        then: (resolve: (v: unknown) => void) => {
          const ageMs = now.getTime() - new Date(windowStart).getTime();
          const count = ageMs <= 90 * 60 * 1000 ? counts.hourly : counts.daily;
          resolve({ count, error: null });
        },
      };
      return chain;
    },
  } as unknown as SupabaseClient;
  return { supabase, gteArgs, inserts };
}

const now = new Date("2026-11-07T12:00:00.000Z");

describe("spendWindowStarts", () => {
  it("returns now minus one hour and now minus 24 hours", () => {
    assert.deepEqual(spendWindowStarts(now), {
      hourlyStart: "2026-11-07T11:00:00.000Z",
      dailyStart: "2026-11-06T12:00:00.000Z",
    });
  });
});

describe("isOverSpendLimit", () => {
  it("allows exactly the ceiling and trips on the next call", () => {
    assert.equal(isOverSpendLimit({ hourly: 199, daily: 599 }), false);
    assert.equal(isOverSpendLimit({ hourly: 200, daily: 599 }), true);
    assert.equal(isOverSpendLimit({ hourly: 0, daily: 600 }), true);
  });
});

describe("spendLimitBody", () => {
  it("always carries the code and a sentence naming the window", () => {
    const hourly = spendLimitBody({ hourly: 200, daily: 0 });
    const daily = spendLimitBody({ hourly: 0, daily: 600 });
    assert.equal(hourly.code, LLM_SPEND_LIMIT_CODE);
    assert.equal(daily.code, "llm_rate_limited");
    assert.ok(hourly.error.length > 0);
    assert.ok(daily.error.length > 0);
    assert.notEqual(hourly.error, daily.error);
  });
});

describe("enforceLlmSpend", () => {
  it("under both ceilings: reserves exactly one row and returns null", async () => {
    const { supabase, inserts } = fakeSupabase(now, { hourly: 5, daily: 10 });
    const res = await enforceLlmSpend(supabase, "user-a", "engine/step", { now });
    assert.equal(res, null);
    assert.deepEqual(inserts, [{ user_id: "user-a", route: "engine/step" }]);
  });

  it("over the hourly ceiling: returns the body and inserts nothing", async () => {
    const { supabase, inserts } = fakeSupabase(now, { hourly: 200, daily: 200 });
    const res = await enforceLlmSpend(supabase, "user-a", "engine/step", { now });
    assert.deepEqual(res, spendLimitBody({ hourly: 200, daily: 200 }));
    assert.equal(inserts.length, 0);
  });

  it("over the daily ceiling: returns the body and inserts nothing", async () => {
    const { supabase, inserts } = fakeSupabase(now, { hourly: 3, daily: 600 });
    const res = await enforceLlmSpend(supabase, "user-a", "engine/step", { now });
    assert.deepEqual(res, spendLimitBody({ hourly: 3, daily: 600 }));
    assert.equal(inserts.length, 0);
  });

  it("filters the two count queries by now-1h and now-24h", async () => {
    const { supabase, gteArgs } = fakeSupabase(now, { hourly: 0, daily: 0 });
    await enforceLlmSpend(supabase, "user-a", "engine/step", { now });
    assert.deepEqual([...gteArgs].sort(), [
      "2026-11-06T12:00:00.000Z",
      "2026-11-07T11:00:00.000Z",
    ]);
  });

  it("fails closed when the count query errors", async () => {
    const supabase = {
      from: () => {
        const chain = {
          select: () => chain,
          eq: () => chain,
          gte: () => chain,
          then: (resolve: (v: unknown) => void) =>
            resolve({ count: null, error: { message: "db down" } }),
        };
        return chain;
      },
    } as unknown as SupabaseClient;
    await assert.rejects(enforceLlmSpend(supabase, "user-a", "engine/step"), /db down/);
  });
});
