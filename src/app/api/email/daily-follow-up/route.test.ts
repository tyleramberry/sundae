import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { runDailyFollowUpEmailTrigger } from "./route";
import type { createClient } from "@/lib/supabase/server";
import type { sendDailyFollowUpEmail } from "@/lib/email/dailyFollowUp";

type Supabase = Awaited<ReturnType<typeof createClient>>;

// Fake supabase whose llm_call_events counts are configurable (same shape
// as the engine/step and revise route tests). gte() distinguishes the
// hourly vs daily window the way the real query builder does.
function setup(counts = { hourly: 0, daily: 0 }) {
  const calls: string[] = [];
  const inserts: Array<Record<string, unknown>> = [];
  const supabase = {
    from() {
      let isDaily = false;
      const chain = {
        select: () => chain,
        eq: () => chain,
        gte: (_c: string, v: string) => {
          isDaily = Date.now() - new Date(v).getTime() > 90 * 60 * 1000;
          return chain;
        },
        insert: async (row: Record<string, unknown>) => {
          calls.push("insert");
          inserts.push(row);
          return { error: null };
        },
        then: (resolve: (v: unknown) => void) =>
          resolve({ count: isDaily ? counts.daily : counts.hourly, error: null }),
      };
      return chain;
    },
  } as unknown as Supabase;

  const send = (async () => {
    calls.push("send");
    return { id: "re_123" };
  }) as unknown as typeof sendDailyFollowUpEmail;

  return { supabase, calls, inserts, send };
}

function run(s: ReturnType<typeof setup>) {
  return runDailyFollowUpEmailTrigger({
    supabase: s.supabase,
    user: { id: "user-a", email: "a@example.com" },
    sendDailyFollowUpEmail: s.send,
  });
}

describe("runDailyFollowUpEmailTrigger", () => {
  it("429s with the spend code when the guard trips, and never sends", async () => {
    const s = setup({ hourly: 200, daily: 200 });
    const res = await run(s);
    assert.equal(res.status, 429);
    assert.equal(res.body.code, "llm_rate_limited");
    assert.deepEqual(s.calls, []);
  });

  it("records the spend row before the send, under its own route name", async () => {
    const s = setup();
    const res = await run(s);
    assert.equal(res.status, 200);
    assert.deepEqual(s.calls, ["insert", "send"]);
    assert.equal(s.inserts[0].route, "email/daily-follow-up");
    assert.equal(res.body.id, "re_123");
  });

  it("fails closed with 502 and never sends when the spend count read fails", async () => {
    const supabase = {
      from() {
        const chain = {
          select: () => chain,
          eq: () => chain,
          gte: () => chain,
          then: (resolve: (v: unknown) => void) =>
            resolve({ count: 0, error: { message: "db down" } }),
        };
        return chain;
      },
    } as unknown as Supabase;
    let sent = 0;
    const send = (async () => {
      sent++;
      return { id: "re_x" };
    }) as unknown as typeof sendDailyFollowUpEmail;
    const res = await runDailyFollowUpEmailTrigger({
      supabase,
      user: { id: "user-a", email: "a@example.com" },
      sendDailyFollowUpEmail: send,
    });
    assert.equal(res.status, 502);
    assert.equal(sent, 0);
  });
});
