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

// SEC-1 finding L2: like /api/email/daily-follow-up, this was callable by any
// signed-in user with no throttle and no environment gate, and each call
// reaches a real Claude call (getSessionRecap) plus a real Resend send. Its
// only caller is /debug/email (dev-only), so it carries the same production
// switch as its preview sibling and reserves a row in the shared per-user LLM
// spend guard before the Claude call.
type SupabaseServer = Awaited<ReturnType<typeof createClient>>;

export type ManualEmailResult = { status: number; body: Record<string, unknown> };

// Everything after the environment gate and the auth check, with the Claude
// call and the sender injected so a test can drive the real path against stubs.
export async function runSessionRecapTrigger(input: {
  supabase: SupabaseServer;
  user: { id: string; email: string };
  getRecap: typeof getSessionRecap;
  send: typeof sendSessionRecapEmail;
}): Promise<ManualEmailResult> {
  try {
    const lastWeek = await getLastWeekContext(input.supabase, input.user.id);
    if (!lastWeek) {
      return {
        status: 400,
        body: { error: "No prior week on file yet for this account -- nothing to recap." },
      };
    }

    const onboarding = await getOnboardingAnswers(input.supabase, input.user.id);
    const roles = onboarding?.roles ?? [];
    const kpiItems: (KpiItem & { role: string })[] = lastWeek.items.map((i) => ({
      role: i.role,
      type: i.type,
      done: i.done,
      percent: i.percent,
    }));
    const roleKpis = computeKpisForRoles(roles, groupItemsByRole(kpiItems));

    // After auth and after the "nothing to recap" 400 above, but before the
    // Claude call below -- so an account with no prior week never burns a
    // spend row for a call that would not have happened.
    const spendLimit = await enforceLlmSpend(
      input.supabase,
      input.user.id,
      "email/session-recap",
    );
    if (spendLimit) return { status: 429, body: spendLimit };

    const recap = await input.getRecap(EXAMPLE_TRANSCRIPT);
    const result = await input.send({
      to: input.user.email,
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
    return { status: 500, body: { error: "Failed to prepare or send session recap." } };
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

  const result = await runSessionRecapTrigger({
    supabase,
    user: { id: user.id, email: user.email },
    getRecap: getSessionRecap,
    send: sendSessionRecapEmail,
  });
  return NextResponse.json(result.body, { status: result.status });
}
