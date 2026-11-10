import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { POST, runDailyFollowUpEmailTrigger } from "./route";
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

// ---------------------------------------------------------------------------
// Route-level coverage, ported from the Air chain's S-5 tests (c1b1124).
// The helper tests above only exercise runDailyFollowUpEmailTrigger. These exercise POST itself,
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
    // Proves the spy and its host classifier really see a Resend POST, so the
    // zero counts above are not vacuous.
    await globalThis.fetch("https://api.resend.com/emails", { method: "POST" });
    assert.equal(spy.resend().length, 1);
  });
});
