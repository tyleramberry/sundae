import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { handleWeeklySessionStep } from "./route";
import type { createClient } from "@/lib/supabase/server";
import type { processWeeklySessionMessage } from "@/lib/engine/weeklySession";

type Supabase = Awaited<ReturnType<typeof createClient>>;

describe("handleWeeklySessionStep", () => {
  it("429s with the spend code when the guard trips, before the engine or any insert", async () => {
    let llmInserts = 0;
    let engineCalls = 0;
    const supabase = {
      auth: { getUser: async () => ({ data: { user: { id: "user-a" } } }) },
      from(table: string) {
        const chain = {
          select: () => chain,
          eq: () => chain,
          gte: () => chain,
          maybeSingle: async () => ({
            data:
              table === "onboarding_answers"
                ? { user_id: "user-a", roles: ["Founder"], answers: [] }
                : null,
            error: null,
          }),
          insert: async () => {
            if (table === "llm_call_events") llmInserts++;
            return { error: null };
          },
          then: (resolve: (v: unknown) => void) =>
            resolve({ count: table === "llm_call_events" ? 200 : 0, error: null }),
        };
        return chain;
      },
    } as unknown as Supabase;
    const engine = (async () => {
      engineCalls++;
      throw new Error("engine must not run");
    }) as unknown as typeof processWeeklySessionMessage;

    const res = await handleWeeklySessionStep(
      new Request("http://localhost/api/weekly-session/step", {
        method: "POST",
        body: JSON.stringify({ message: "hello" }),
      }),
      { supabase, processWeeklySessionMessage: engine },
    );

    assert.equal(res.status, 429);
    const body = (await res.json()) as { code?: string };
    assert.equal(body.code, "llm_rate_limited");
    assert.equal(engineCalls, 0);
    assert.equal(llmInserts, 0);
  });
});
