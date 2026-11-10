import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isProductionRuntime, productionUnavailableResponse } from "@/lib/devOnly";
import { enforceLlmSpend } from "@/lib/llm/spendGuard";
import { getLastWeekContext } from "@/lib/weeklySession/persist";
import { getOnboardingAnswers } from "@/lib/onboarding/persist";
import { computeKpisForRoles, groupItemsByRole, type KpiItem } from "@/lib/kpi/compute";
import { getSessionRecap } from "@/lib/agents/sessionRecapAgent";
import { EmailError, sendSessionRecapEmail } from "@/lib/email/sessionRecap";
import type { Turn } from "@/lib/engine/types";

// Manual trigger, same role as /api/email/daily-follow-up's own manual
// route: sends the signed-in user their own session-recap email on demand,
// rather than only ever firing automatically from
// /api/weekly-session/confirm. Exists so the actual send path (Resend
// call included, not just the preview) is testable without running a full
// weekly session to completion first.
//
// S-5: that makes it a developer/tester endpoint, not a product surface,
// so POST 404s outside local dev (same gate as the email debug routes) --
// until now any signed-in user could hit it. Each call spends real Claude
// tokens (getSessionRecap) and a real Resend send, so it reserves a row
// in the shared per-user spend guard (src/lib/llm/spendGuard.ts) before
// reaching either. No second counter: the spend guard is deliberately the
// repo-wide single counter.
//
// Wins/improvements necessarily come from an EXAMPLE transcript here, same
// honest limitation as /api/email/session-recap/debug: a session's real
// transcript only ever exists in the browser tab that ran it and isn't
// persisted server-side, so there's no real past conversation to pull for
// a manual, out-of-band trigger like this one. A real completed session
// sends the real thing, via confirm's own call to this same email module.
const EXAMPLE_TRANSCRIPT: Turn[] = [
  {
    role: "assistant",
    content:
      "Hey, welcome back! Before we plan ahead, what felt like wins last week? Looking for about three things that went well.",
  },
  {
    role: "user",
    content:
      "Shipped the investor update on time, finally booked that PT session I'd been putting off, and I ran every morning without missing a day.",
  },
  {
    role: "assistant",
    content: "Solid week. And what would you improve on?",
  },
  {
    role: "user",
    content:
      "I let the sales pipeline reviews slide, and I didn't read with the kids most nights like I wanted to.",
  },
];

type SupabaseServer = Awaited<ReturnType<typeof createClient>>;

export type SessionRecapResult = { status: number; body: Record<string, unknown> };

// Deps are injected so the test can stub every Claude/Resend/DB touchpoint
// the way the step and revise route tests do.
export async function runSessionRecapEmailTrigger(
  input: {
    supabase: SupabaseServer;
    user: { id: string; email: string };
  } & {
    getLastWeekContext: typeof getLastWeekContext;
    getOnboardingAnswers: typeof getOnboardingAnswers;
    getSessionRecap: typeof getSessionRecap;
    sendSessionRecapEmail: typeof sendSessionRecapEmail;
  },
): Promise<SessionRecapResult> {
  const { supabase, user } = input;
  try {
    const lastWeek = await input.getLastWeekContext(supabase, user.id);
    if (!lastWeek) {
      return {
        status: 400,
        body: { error: "No prior week on file yet for this account -- nothing to recap." },
      };
    }

    const onboarding = await input.getOnboardingAnswers(supabase, user.id);
    const roles = onboarding?.roles ?? [];
    const kpiItems: (KpiItem & { role: string })[] = lastWeek.items.map((i) => ({
      role: i.role,
      type: i.type,
      done: i.done,
      percent: i.percent,
    }));
    const roleKpis = computeKpisForRoles(roles, groupItemsByRole(kpiItems));

    // Inside the try so a Supabase failure fails closed (the guard throws
    // when it can't read the count) and never reaches Claude or Resend.
    // Placed after the cheap DB reads -- same "checked before the costly
    // call" order as the revise route -- so a user with nothing to recap
    // doesn't burn a spend row.
    const spendLimit = await enforceLlmSpend(supabase, user.id, "email/session-recap");
    if (spendLimit) return { status: 429, body: spendLimit };

    const recap = await input.getSessionRecap(EXAMPLE_TRANSCRIPT);
    const result = await input.sendSessionRecapEmail({
      to: user.email,
      weekStart: lastWeek.weekStart,
      recap,
      roleKpis,
    });
    return { status: 200, body: { ok: true, id: result.id } };
  } catch (error) {
    if (error instanceof EmailError) {
      return { status: 400, body: { error: error.message } };
    }
    console.error("[session-recap] failed to prepare or send:", error);
    return { status: 502, body: { error: "Failed to prepare or send session recap." } };
  }
}

export async function POST() {
  if (isProductionRuntime()) return productionUnavailableResponse();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !user.email) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const email = user.email;
  const result = await runSessionRecapEmailTrigger({
    supabase,
    user: { id: user.id, email },
    getLastWeekContext,
    getOnboardingAnswers,
    getSessionRecap,
    sendSessionRecapEmail,
  });
  return NextResponse.json(result.body, { status: result.status });
}
