import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { POST, runSessionRecapTrigger } from "./route";
import { EmailError, sendSessionRecapEmail } from "@/lib/email/sessionRecap";
import { LLM_SPEND_HOURLY_LIMIT, spendLimitBody } from "@/lib/llm/spendGuard";
import type { getSessionRecap } from "@/lib/agents/sessionRecapAgent";
import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

// NODE_ENV is typed readonly. Tests write through a loose view and restore
// whatever the process started with.
const env = process.env as {
  NODE_ENV?: string;
  RESEND_API_KEY?: string;
  RESEND_FROM_EMAIL?: string;
};
const originalNodeEnv = env.NODE_ENV;
const originalResendKey = env.RESEND_API_KEY;
const originalResendFrom = env.RESEND_FROM_EMAIL;

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
  if (originalResendFrom === undefined) delete env.RESEND_FROM_EMAIL;
  else env.RESEND_FROM_EMAIL = originalResendFrom;
  fetchSpy?.restore();
  fetchSpy = null;
});

const recapResult = { wins: ["Shipped"], improvements: ["Slower"] };

// Fake supabase driving the real spend guard and the real last-week/onboarding
// loaders. Every insert, recap call and send goes into one shared ordered log.
function setup(opts: { preseeded?: number; priorWeek?: boolean } = {}) {
  const { preseeded = 0, priorWeek = true } = opts;
  const calls: string[] = [];
  const inserts: Array<Record<string, unknown>> = [];
  const events: string[] = Array.from({ length: preseeded }, () => new Date().toISOString());
  const sendArgs: Array<Parameters<typeof sendSessionRecapEmail>[0]> = [];
  const rows = priorWeek
    ? [{ role: "Athlete", type: "habit", title: "Run", done: true, percent: null }]
    : [];
  const supabase = {
    from(table: string) {
      if (table === "weekly_items") {
        const chain = {
          select: () => chain,
          eq: () => chain,
          is: () => chain,
          then: (resolve: (v: unknown) => void) => resolve({ data: rows, error: null }),
        };
        return chain;
      }
      if (table === "onboarding_answers") {
        const chain = {
          select: () => chain,
          eq: () => chain,
          maybeSingle: async () => ({ data: { roles: ["Athlete"] }, error: null }),
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
  let recapCalls = 0;
  const getRecap = (async () => {
    calls.push("getRecap");
    recapCalls++;
    return recapResult;
  }) as unknown as typeof getSessionRecap;
  const send = (async (arg: Parameters<typeof sendSessionRecapEmail>[0]) => {
    calls.push("send");
    sendArgs.push(arg);
    return { id: "email-1" };
  }) as unknown as typeof sendSessionRecapEmail;
  return { supabase, calls, inserts, sendArgs, getRecap, send, recapCalls: () => recapCalls };
}

const user = { id: "user-a", email: "user@example.com" };

function run(s: ReturnType<typeof setup>) {
  return runSessionRecapTrigger({
    supabase: s.supabase,
    user,
    getRecap: s.getRecap,
    send: s.send,
  });
}

describe("POST /api/email/session-recap", () => {
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

  it("spy control: the real email module makes one observable Resend POST", async () => {
    env.RESEND_API_KEY = "test-key";
    delete env.RESEND_FROM_EMAIL;
    const spy = installFetchSpy();
    // A real Resend POST through the real email module, so the production
    // test's zero counts have teeth.
    const result = await sendSessionRecapEmail({
      to: "user@example.com",
      weekStart: "2026-11-02",
      recap: { wins: ["a"], improvements: ["b"] },
      roleKpis: [],
    });
    assert.deepEqual(result, { id: "email-1" });
    assert.equal(spy.resend().length, 1);
  });
});

describe("runSessionRecapTrigger", () => {
  it("non-production, signed in, under quota, prior week: reserves spend, recaps, sends", async () => {
    env.NODE_ENV = "development";
    const s = setup();
    const res = await run(s);
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { ok: true, id: "email-1" });
    assert.deepEqual(s.calls, ["insert", "getRecap", "send"]);
    assert.equal(s.recapCalls(), 1);
    assert.equal(s.sendArgs.length, 1);
    assert.equal(s.inserts[0].route, "email/session-recap");
    const arg = s.sendArgs[0];
    assert.equal(arg.to, "user@example.com");
    assert.deepEqual(arg.recap, recapResult);
    assert.ok(Array.isArray(arg.roleKpis));
    assert.match(arg.weekStart, /^\d{4}-\d{2}-\d{2}$/);
  });

  it("no prior week: 400 and the guard is not charged", async () => {
    const s = setup({ priorWeek: false });
    const res = await run(s);
    assert.equal(res.status, 400);
    assert.deepEqual(res.body, {
      error: "No prior week on file yet for this account -- nothing to recap.",
    });
    assert.equal(s.recapCalls(), 0);
    assert.equal(s.sendArgs.length, 0);
    assert.equal(s.inserts.length, 0);
  });

  it("over quota: 429 with zero recap calls, zero sends, zero inserts", async () => {
    const s = setup({ preseeded: LLM_SPEND_HOURLY_LIMIT });
    const res = await run(s);
    assert.equal(res.status, 429);
    assert.deepEqual(
      res.body,
      spendLimitBody({ hourly: LLM_SPEND_HOURLY_LIMIT, daily: LLM_SPEND_HOURLY_LIMIT }),
    );
    assert.equal(res.body.code, "llm_rate_limited");
    assert.equal(s.recapCalls(), 0);
    assert.equal(s.sendArgs.length, 0);
    assert.equal(s.inserts.length, 0);
  });

  it("EmailError maps to 400; any other error maps to 500", async () => {
    const emailFail = setup();
    const res1 = await runSessionRecapTrigger({
      supabase: emailFail.supabase,
      user,
      getRecap: emailFail.getRecap,
      send: (async () => {
        throw new EmailError("RESEND_API_KEY is not set.");
      }) as unknown as typeof sendSessionRecapEmail,
    });
    assert.equal(res1.status, 400);
    assert.deepEqual(res1.body, { error: "RESEND_API_KEY is not set." });
    assert.equal(emailFail.inserts.length, 1);

    const recapFail = setup();
    const originalError = console.error;
    console.error = () => {};
    try {
      const res2 = await runSessionRecapTrigger({
        supabase: recapFail.supabase,
        user,
        getRecap: (async () => {
          throw new Error("boom");
        }) as unknown as typeof getSessionRecap,
        send: recapFail.send,
      });
      assert.equal(res2.status, 500);
      assert.deepEqual(res2.body, { error: "Failed to prepare or send session recap." });
    } finally {
      console.error = originalError;
    }
  });
});
