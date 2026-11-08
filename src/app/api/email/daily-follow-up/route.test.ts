import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { POST, runDailyFollowUpTrigger } from "./route";
import { EmailError, type sendDailyFollowUpEmail } from "@/lib/email/dailyFollowUp";
import { LLM_SPEND_HOURLY_LIMIT, spendLimitBody } from "@/lib/llm/spendGuard";
import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

// NODE_ENV is typed readonly. Tests write through a loose view and restore
// whatever the process started with.
const env = process.env as { NODE_ENV?: string; RESEND_API_KEY?: string };
const originalNodeEnv = env.NODE_ENV;
const originalResendKey = env.RESEND_API_KEY;

type FetchCall = { url: string; method: string };

let fetchSpy: FetchSpy | null = null;

type FetchSpy = {
  calls: FetchCall[];
  resend: () => FetchCall[];
  anthropic: () => FetchCall[];
  restore: () => void;
};

const originalFetch = globalThis.fetch;

function installFetchSpy(): FetchSpy {
  const calls: FetchCall[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    calls.push({ url, method: init?.method ?? "GET" });
    return new Response(JSON.stringify({ id: "email-1" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
  const spy: FetchSpy = {
    calls,
    resend: () => calls.filter((c) => c.url.includes("api.resend.com")),
    anthropic: () => calls.filter((c) => c.url.includes("anthropic.com")),
    restore: () => {
      globalThis.fetch = originalFetch;
    },
  };
  fetchSpy = spy;
  return spy;
}

afterEach(() => {
  if (originalNodeEnv === undefined) delete env.NODE_ENV;
  else env.NODE_ENV = originalNodeEnv;
  if (originalResendKey === undefined) delete env.RESEND_API_KEY;
  else env.RESEND_API_KEY = originalResendKey;
  fetchSpy?.restore();
  fetchSpy = null;
});

// Fake supabase driving the real spend guard: llm_call_events counts come from
// an in-memory list of timestamps; every insert and every send goes into one
// shared ordered log so ordering is provable.
function setup(preseeded = 0) {
  const calls: string[] = [];
  const inserts: Array<Record<string, unknown>> = [];
  const events: string[] = Array.from({ length: preseeded }, () => new Date().toISOString());
  const sendArgs: Array<Parameters<typeof sendDailyFollowUpEmail>[0]> = [];
  let since = "";
  const supabase = {
    from() {
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
  const send = (async (arg: Parameters<typeof sendDailyFollowUpEmail>[0]) => {
    calls.push("send");
    sendArgs.push(arg);
    return { id: "email-1" };
  }) as unknown as typeof sendDailyFollowUpEmail;
  return { supabase, calls, inserts, sendArgs, send };
}

const user = { id: "user-a", email: "user@example.com" };

describe("POST /api/email/daily-follow-up", () => {
  it("404s in production before touching auth, Claude or Resend", async () => {
    env.NODE_ENV = "production";
    const spy = installFetchSpy();
    let thrown: unknown;
    let response: Response | undefined;
    try {
      response = await POST();
    } catch (e) {
      thrown = e;
    }
    assert.equal(
      thrown,
      undefined,
      "POST must 404 before createClient()/auth runs, but it threw: " + String(thrown),
    );
    assert.ok(response);
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { error: "Not available outside local dev." });
    assert.equal(spy.resend().length, 0);
    assert.equal(spy.anthropic().length, 0);
    assert.equal(spy.calls.length, 0);
  });

  it("spy control: the spy observes a Resend POST", async () => {
    const spy = installFetchSpy();
    // Proves the spy and its host classifier actually see a Resend POST, so the
    // zero counts in the production test are not vacuous.
    await globalThis.fetch("https://api.resend.com/emails", { method: "POST" });
    assert.equal(spy.resend().length, 1);
  });
});

describe("runDailyFollowUpTrigger", () => {
  it("non-production, signed in, under quota: reserves spend then sends", async () => {
    env.NODE_ENV = "development";
    const s = setup(0);
    const res = await runDailyFollowUpTrigger({ supabase: s.supabase, user, send: s.send });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { ok: true, id: "email-1" });
    assert.equal(s.sendArgs.length, 1);
    assert.deepEqual(s.sendArgs[0], { to: "user@example.com", userId: "user-a", supabase: s.supabase });
    assert.equal(s.sendArgs[0].supabase, s.supabase);
    assert.equal(s.inserts[0].route, "email/daily-follow-up");
    assert.deepEqual(s.calls, ["insert", "send"]);
  });

  it("over quota: 429 with zero sends and zero inserts", async () => {
    const s = setup(LLM_SPEND_HOURLY_LIMIT);
    const res = await runDailyFollowUpTrigger({ supabase: s.supabase, user, send: s.send });
    assert.equal(res.status, 429);
    assert.deepEqual(
      res.body,
      spendLimitBody({ hourly: LLM_SPEND_HOURLY_LIMIT, daily: LLM_SPEND_HOURLY_LIMIT }),
    );
    assert.equal(res.body.code, "llm_rate_limited");
    assert.equal(s.sendArgs.length, 0);
    assert.equal(s.inserts.length, 0);
  });

  it("EmailError from the sender maps to 400 with its message", async () => {
    const s = setup(0);
    const send = (async () => {
      s.calls.push("send");
      throw new EmailError("RESEND_API_KEY is not set.");
    }) as unknown as typeof sendDailyFollowUpEmail;
    const res = await runDailyFollowUpTrigger({ supabase: s.supabase, user, send });
    assert.equal(res.status, 400);
    assert.deepEqual(res.body, { error: "RESEND_API_KEY is not set." });
    assert.deepEqual(s.calls, ["insert", "send"]);
  });

  it("any other error still propagates", async () => {
    const s = setup(0);
    const send = (async () => {
      throw new Error("boom");
    }) as unknown as typeof sendDailyFollowUpEmail;
    await assert.rejects(
      runDailyFollowUpTrigger({ supabase: s.supabase, user, send }),
      /boom/,
    );
  });
});
