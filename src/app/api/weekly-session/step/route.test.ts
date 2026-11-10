import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { STEP_WRITER_UNAVAILABLE_MESSAGE, handleWeeklySessionStep } from "./route";
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
      { supabase, processWeeklySessionMessage: engine, transcriptWriter: () => ({} as SupabaseClient) },
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
      { supabase, processWeeklySessionMessage: engine, transcriptWriter: () => transcriptWriter },
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

  // The service-role writer is a factory the handler calls only after this
  // request's own 401/400 gates (route.ts, the guard above its big try). If it
  // were built first -- as POST used to do -- a deployment missing
  // SUPABASE_SECRET_KEY would turn even a signed-out request into a raw 500.
  const engineThatMustNotRun = (counter: { calls: number }) =>
    (async () => {
      counter.calls++;
      throw new Error("engine must not run");
    }) as unknown as typeof processWeeklySessionMessage;

  it("a signed-out caller gets 401 and the service-role writer is never constructed", async () => {
    let writerCalls = 0;
    const engine = { calls: 0 };
    const supabase = {
      auth: { getUser: async () => ({ data: { user: null } }) },
    } as unknown as Supabase;

    const res = await handleWeeklySessionStep(
      new Request("http://localhost/api/weekly-session/step", {
        method: "POST",
        body: JSON.stringify({ message: "hello" }),
      }),
      {
        supabase,
        processWeeklySessionMessage: engineThatMustNotRun(engine),
        transcriptWriter: () => {
          writerCalls++;
          return {} as SupabaseClient;
        },
      },
    );

    assert.equal(res.status, 401);
    const body = (await res.json()) as { error?: string };
    assert.equal(body.error, "Not signed in");
    assert.equal(writerCalls, 0);
    assert.equal(engine.calls, 0);
  });

  it("a malformed body is 400 and the service-role writer is never constructed", async () => {
    let writerCalls = 0;
    const engine = { calls: 0 };
    const supabase = {
      auth: { getUser: async () => ({ data: { user: { id: "user-a" } } }) },
    } as unknown as Supabase;

    const res = await handleWeeklySessionStep(
      new Request("http://localhost/api/weekly-session/step", {
        method: "POST",
        body: JSON.stringify({ nope: true }),
      }),
      {
        supabase,
        processWeeklySessionMessage: engineThatMustNotRun(engine),
        transcriptWriter: () => {
          writerCalls++;
          return {} as SupabaseClient;
        },
      },
    );

    assert.equal(res.status, 400);
    const body = (await res.json()) as { error?: string };
    assert.equal(body.error, "Body must include a string `message` field.");
    assert.equal(writerCalls, 0);
    assert.equal(engine.calls, 0);
  });

  it("a signed-in caller on a deployment missing its service-role key gets the honest 500, and nothing runs", async () => {
    const engine = { calls: 0 };
    const writes: { table: string; op: string }[] = [];
    const supabase = {
      auth: { getUser: async () => ({ data: { user: { id: "user-a" } } }) },
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
          insert: async () => {
            writes.push({ table, op: "insert" });
            return { error: null };
          },
          update: () => {
            writes.push({ table, op: "update" });
            return chain;
          },
          upsert: async () => {
            writes.push({ table, op: "upsert" });
            return { error: null };
          },
          delete: () => {
            writes.push({ table, op: "delete" });
            return chain;
          },
          then: (resolve: (v: unknown) => void) => resolve({ data: [], count: 0, error: null }),
        };
        return chain;
      },
    } as unknown as Supabase;
    const missingKey = new Error(
      "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY must both be set to create the admin client.",
    );

    const logged: unknown[][] = [];
    const originalError = console.error;
    console.error = (...args: unknown[]) => {
      logged.push(args);
    };
    let res: Response;
    try {
      res = await handleWeeklySessionStep(
        new Request("http://localhost/api/weekly-session/step", {
          method: "POST",
          body: JSON.stringify({ message: "hello" }),
        }),
        {
          supabase,
          processWeeklySessionMessage: engineThatMustNotRun(engine),
          transcriptWriter: () => {
            throw missingKey;
          },
        },
      );
    } finally {
      console.error = originalError;
    }

    assert.equal(res.status, 500);
    const body = (await res.json()) as { error?: string };
    assert.equal(body.error, STEP_WRITER_UNAVAILABLE_MESSAGE);
    assert.notEqual(body.error, "The planning engine had trouble with that — try again.");
    // The misconfiguration is logged for the operator, not swallowed.
    assert.ok(
      logged.some((args) => args.includes(missingKey)),
      "the thrown missing-key error must reach console.error",
    );
    assert.equal(engine.calls, 0);
    assert.deepEqual(writes, []);
  });
});
