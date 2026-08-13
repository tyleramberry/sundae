import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isProductionRuntime, productionUnavailableResponse } from "@/lib/devOnly";
import { getLastWeekContext } from "@/lib/weeklySession/persist";
import { getOnboardingAnswers } from "@/lib/onboarding/persist";
import { computeKpisForRoles, groupItemsByRole, type KpiItem } from "@/lib/kpi/compute";
import { getSessionRecap } from "@/lib/agents/sessionRecapAgent";
import { buildSessionRecapEmail } from "@/lib/email/sessionRecap";
import type { Turn } from "@/lib/engine/types";

// Read-only debug output for the session-recap email. No send, no Resend
// key needed.
//
// The KPI half is 100% real: it reads the signed-in user's actual last
// week via getLastWeekContext, same call the confirm route makes.
//
// The wins/improvements half genuinely can't be "real" here the way the
// daily-brief debug view's calendar data is real: a session's transcript
// only ever exists in the browser tab that ran it (see weeklySession.ts's
// "state is just the transcript" design) -- nothing persists it
// server-side once the session ends, so there is no real past transcript
// to fetch. This route runs the real agent against a clearly-labeled
// EXAMPLE transcript instead, so the extraction step itself is still
// genuinely exercised, just not against your specific last session.
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

export async function GET() {
  if (isProductionRuntime()) return productionUnavailableResponse();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  try {
    const lastWeek = await getLastWeekContext(supabase, user.id);
    if (!lastWeek) {
      return NextResponse.json({
        note: "No prior week on file for this account yet -- the recap email only sends once there's a week to recap.",
        roleKpis: [],
      });
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
    const { subject, html, text } = buildSessionRecapEmail({
      weekStart: lastWeek.weekStart,
      recap,
      roleKpis,
    });

    return NextResponse.json({
      transcriptSource: "example -- real transcripts aren't persisted server-side, see this route's file header",
      weekStart: lastWeek.weekStart,
      roleKpis,
      recap,
      subject,
      html,
      text,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
