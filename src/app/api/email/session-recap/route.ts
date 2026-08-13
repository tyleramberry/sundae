import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
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

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !user.email) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const lastWeek = await getLastWeekContext(supabase, user.id);
  if (!lastWeek) {
    return NextResponse.json(
      { error: "No prior week on file yet for this account -- nothing to recap." },
      { status: 400 },
    );
  }

  const onboarding = await getOnboardingAnswers(supabase, user.id);
  const roles = onboarding?.roles ?? [];
  const kpiItems: (KpiItem & { role: string })[] = lastWeek.items.map((i) => ({
    role: i.role,
    type: i.type,
    done: i.done,
    percent: i.percent,
  }));
  const roleKpis = computeKpisForRoles(roles, groupItemsByRole(kpiItems));
  const recap = await getSessionRecap(EXAMPLE_TRANSCRIPT);

  try {
    const result = await sendSessionRecapEmail({
      to: user.email,
      weekStart: lastWeek.weekStart,
      recap,
      roleKpis,
    });
    return NextResponse.json({ ok: true, id: result.id });
  } catch (error) {
    if (error instanceof EmailError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}
