import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { handleWeeklySessionStep } from "./route";
import type { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
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
      // 429s before any write, so a stub writer is enough here.
      { supabase, processWeeklySessionMessage: engine, transcriptWriter: {} as SupabaseClient },
    );

    assert.equal(res.status, 429);
    const body = (await res.json()) as { code?: string };
    assert.equal(body.code, "llm_rate_limited");
    assert.equal(engineCalls, 0);
    assert.equal(llmInserts, 0);
  });

  it("writes active_state through the injected transcriptWriter, never the session client", async () => {
    type Write = { table: string; op: string; payload: Record<string, unknown> };
    const makeClient = (writes: Write[], withAuth: boolean) =>
      ({
        ...(withAuth ? { auth: { getUser: async () => ({ data: { user: { id: "user-a" } } }) } } : {}),
        from(table: string) {
          const chain: Record<string, unknown> = {
            select: () => chain,
            eq: () => chain,
            gte: () => chain,
            is: () => chain,
            not: () => chain,
            order: () => chain,
            limit: () => chain,
            maybeSingle: async () => ({
              data: table === "onboarding_answers" ? { user_id: "user-a", roles: ["Founder"], answers: [] } : null,
              error: null,
            }),
            insert: async (payload: Record<string, unknown>) => {
              writes.push({ table, op: "insert", payload });
              return { error: null };
            },
            update: (payload: Record<string, unknown>) => {
              writes.push({ table, op: "update", payload });
              return chain;
            },
            then: (resolve: (v: unknown) => void) => resolve({ data: [], count: 0, error: null }),
          };
          return chain;
        },
      }) as unknown as SupabaseClient;

    const sessionWrites: Write[] = [];
    const writerWrites: Write[] = [];
    const supabase = makeClient(sessionWrites, true) as unknown as Supabase;
    const transcriptWriter = makeClient(writerWrites, false);
    const engine = (async () => ({
      reply: "Welcome back.",
      state: { turns: [{ role: "user", content: "hello" }] },
      actionsSoFar: [],
      action: null,
      usage: { inputTokens: 1, outputTokens: 1 },
    })) as unknown as typeof processWeeklySessionMessage;

    const res = await handleWeeklySessionStep(
      new Request("http://localhost/api/weekly-session/step", {
        method: "POST",
        body: JSON.stringify({ message: "hello", timeZone: "America/Denver" }),
      }),
      { supabase, processWeeklySessionMessage: engine, transcriptWriter },
    );

    assert.equal(res.status, 200);
    const activeStateWrites = (ws: Write[]) =>
      ws.filter((w) => w.table === "weekly_session_transcripts" && "active_state" in w.payload);
    assert.equal(activeStateWrites(writerWrites).length, 1);
    assert.deepEqual(activeStateWrites(writerWrites)[0].payload.active_state, {
      turns: [{ role: "user", content: "hello" }],
    });
    assert.equal(activeStateWrites(sessionWrites).length, 0);
    assert.equal(sessionWrites.filter((w) => w.table === "weekly_session_transcripts").length, 0);
  });
});
