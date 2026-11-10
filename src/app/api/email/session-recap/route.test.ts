import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { POST, runSessionRecapEmailTrigger } from "./route";
import type { createClient } from "@/lib/supabase/server";
import type { getLastWeekContext } from "@/lib/weeklySession/persist";
import type { getOnboardingAnswers } from "@/lib/onboarding/persist";
import type { getSessionRecap } from "@/lib/agents/sessionRecapAgent";
import { sendSessionRecapEmail } from "@/lib/email/sessionRecap";

type Supabase = Awaited<ReturnType<typeof createClient>>;

// Fake supabase whose llm_call_events counts are configurable (same shape
// as the engine/step and revise route tests).
function setupDeps(counts = { hourly: 0, daily: 0 }) {
  const calls: string[] = [];
  const inserts: Array<Record<string, unknown>> = [];
  const spendDb = {
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

  const lastWeek = {
    weekStart: "2026-11-01",
    items: [{ role: "Founder", type: "do", done: true, percent: 100 }],
  };
  const getLastWeek = (async () => {
    calls.push("lastWeek");
    return lastWeek;
  }) as unknown as typeof getLastWeekContext;
  const getOnboarding = (async () => {
    calls.push("onboarding");
    return { roles: ["Founder"] };
  }) as unknown as typeof getOnboardingAnswers;
  const getRecap = (async () => {
    calls.push("claude");
    return { wins: [], improvements: [] };
  }) as unknown as typeof getSessionRecap;
  const send = (async () => {
    calls.push("send");
    return { id: "re_456" };
  }) as unknown as typeof sendSessionRecapEmail;

  return { supabase: spendDb, calls, inserts, getLastWeek, getOnboarding, getRecap, send };
}

function run(s: ReturnType<typeof setupDeps>) {
  return runSessionRecapEmailTrigger({
    supabase: s.supabase,
    user: { id: "user-a", email: "a@example.com" },
    getLastWeekContext: s.getLastWeek,
    getOnboardingAnswers: s.getOnboarding,
    getSessionRecap: s.getRecap,
    sendSessionRecapEmail: s.send,
  });
}

describe("runSessionRecapEmailTrigger", () => {
  it("429s with the spend code when the guard trips, and never calls Claude or sends", async () => {
    const s = setupDeps({ hourly: 200, daily: 200 });
    const res = await run(s);
    assert.equal(res.status, 429);
    assert.equal(res.body.code, "llm_rate_limited");
    assert.deepEqual(s.calls, ["lastWeek", "onboarding"]);
  });

  it("records the spend row before the Claude call, under its own route name", async () => {
    const s = setupDeps();
    const res = await run(s);
    assert.equal(res.status, 200);
    assert.deepEqual(s.calls, ["lastWeek", "onboarding", "insert", "claude", "send"]);
    assert.equal(s.inserts[0].route, "email/session-recap");
    assert.equal(res.body.id, "re_456");
  });

  it("returns 400 without reserving a spend row when there is no prior week", async () => {
    const s = setupDeps();
    const res = await runSessionRecapEmailTrigger({
      supabase: s.supabase,
      user: { id: "user-a", email: "a@example.com" },
      getLastWeekContext: (async () => null) as unknown as typeof getLastWeekContext,
      getOnboardingAnswers: s.getOnboarding,
      getSessionRecap: s.getRecap,
      sendSessionRecapEmail: s.send,
    });
    assert.equal(res.status, 400);
    assert.deepEqual(s.calls, []);
  });

  it("fails closed with 502 and never reaches Claude when the spend count read fails", async () => {
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
    let claude = 0;
    const res = await runSessionRecapEmailTrigger({
      supabase,
      user: { id: "user-a", email: "a@example.com" },
      getLastWeekContext: (async () => ({
        weekStart: "2026-11-01",
        items: [],
      })) as unknown as typeof getLastWeekContext,
      getOnboardingAnswers: (async () => ({ roles: [] })) as unknown as typeof getOnboardingAnswers,
      getSessionRecap: (async () => {
        claude++;
        return {};
      }) as unknown as typeof getSessionRecap,
      sendSessionRecapEmail: (async () => ({ id: "x" })) as unknown as typeof sendSessionRecapEmail,
    });
    assert.equal(res.status, 502);
    assert.equal(claude, 0);
  });
});

// ---------------------------------------------------------------------------
// Route-level coverage, ported from the Air chain's S-5 tests (c1b1124).
// The helper tests above only exercise runSessionRecapEmailTrigger. These exercise POST itself,
// because the production switch lives in POST, and deleting that one line
// leaves every helper test green.
// ---------------------------------------------------------------------------

const env = process.env as { NODE_ENV?: string; RESEND_API_KEY?: string };
const originalNodeEnv = env.NODE_ENV;
const originalResendKey = env.RESEND_API_KEY;

type FetchCall = { url: string; method: string };
type FetchSpy = {
  calls: FetchCall[];
  resend: () => FetchCall[];
  anthropic: () => FetchCall[];
  restore: () => void;
};

const originalFetch = globalThis.fetch;
let activeFetchSpy: FetchSpy | null = null;

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
  activeFetchSpy = spy;
  return spy;
}

afterEach(() => {
  if (originalNodeEnv === undefined) delete env.NODE_ENV;
  else env.NODE_ENV = originalNodeEnv;
  if (originalResendKey === undefined) delete env.RESEND_API_KEY;
  else env.RESEND_API_KEY = originalResendKey;
  activeFetchSpy?.restore();
  activeFetchSpy = null;
});

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
