import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MAX_ENGINE_MESSAGE_LENGTH, runEngineStep } from "./route";
import { TURN_CAP, TURN_CAP_MESSAGE } from "@/lib/weeklySession/throttle";
import type { createClient } from "@/lib/supabase/server";
import type { processMessage } from "@/lib/engine/engine";

type Supabase = Awaited<ReturnType<typeof createClient>>;

// Fake supabase whose llm_call_events counts are configurable; every insert
// and every engine call is appended to one shared ordered log.
function setup(counts = { hourly: 0, daily: 0 }) {
  const calls: string[] = [];
  const inserts: Array<Record<string, unknown>> = [];
  let engineCalls = 0;
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
  const reply = { reply: "hi", state: { turns: [] }, action: null };
  const stub = (async () => {
    calls.push("engine");
    engineCalls++;
    return reply;
  }) as unknown as typeof processMessage;
  return {
    supabase,
    calls,
    inserts,
    reply,
    stub,
    engineCalls: () => engineCalls,
  };
}

function run(s: ReturnType<typeof setup>, body: unknown) {
  return runEngineStep({
    supabase: s.supabase,
    user: { id: "user-a" },
    body,
    processMessage: s.stub,
  });
}

describe("runEngineStep", () => {
  it("429s with the spend code when the guard trips, and never calls the engine", async () => {
    const s = setup({ hourly: 200, daily: 200 });
    const res = await run(s, { message: "hi", state: null });
    assert.equal(res.status, 429);
    assert.equal(res.body.code, "llm_rate_limited");
    assert.equal(s.engineCalls(), 0);
    assert.equal(s.inserts.length, 0);
  });

  it("records the spend row before calling the engine", async () => {
    const s = setup();
    const res = await run(s, { message: "hi", state: null });
    assert.equal(res.status, 200);
    assert.deepEqual(s.calls, ["insert", "engine"]);
    assert.equal(s.inserts[0].route, "engine/step");
  });

  it("rejects an over-long message but allows the boundary", async () => {
    const tooLong = setup();
    const r1 = await run(tooLong, { message: "x".repeat(MAX_ENGINE_MESSAGE_LENGTH + 1) });
    assert.equal(r1.status, 400);
    assert.equal(tooLong.engineCalls(), 0);

    const ok = setup();
    const r2 = await run(ok, { message: "x".repeat(MAX_ENGINE_MESSAGE_LENGTH) });
    assert.equal(r2.status, 200);
    assert.equal(ok.engineCalls(), 1);
  });

  it("400s on more than TURN_CAP turns (malformed), not a rate limit", async () => {
    const s = setup();
    const res = await run(s, { message: "hi", state: { turns: new Array(TURN_CAP + 1) } });
    assert.equal(res.status, 400);
    assert.equal(s.engineCalls(), 0);
  });

  it("keeps the cheap client-declared cap at exactly TURN_CAP turns", async () => {
    const s = setup();
    const res = await run(s, { message: "hi", state: { turns: new Array(TURN_CAP) } });
    assert.equal(res.status, 429);
    assert.equal(res.body.error, TURN_CAP_MESSAGE);
    assert.equal(s.engineCalls(), 0);
  });

  it("400s when state.turns is not an array", async () => {
    const s = setup();
    const res = await run(s, { message: "hi", state: { turns: "not an array" } });
    assert.equal(res.status, 400);
    assert.equal(res.body.error, "state.turns must be an array.");
    assert.equal(s.engineCalls(), 0);
  });

  it("400s a non-string message without reaching the engine", async () => {
    const s = setup();
    const res = await run(s, { message: 5 });
    assert.equal(res.status, 400);
    assert.equal(s.engineCalls(), 0);
  });

  it("passes an ordinary first message through to the engine", async () => {
    const s = setup();
    const res = await run(s, { message: "I'm a founder", state: null });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, s.reply);
    assert.equal(s.engineCalls(), 1);
  });
});
