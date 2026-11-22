import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  getCommittedPlanActions,
  getLastWeekContext,
  getWeeklySessionTranscript,
} from "@/lib/weeklySession/persist";
import {
  formatPlanningWeekRange,
  planningWeekStart,
  planningWeekStartDate,
} from "@/lib/weeklySession/week";
import { captureServerEvent } from "@/lib/analytics/server";
import {
  isNewSessionBlocked,
  loadFreeTierAccess,
  roundStateOf,
} from "@/lib/weeklySession/freeTier";
import { getOnboardingAnswers } from "@/lib/onboarding/persist";
import { computeKpisForRoles, groupItemsByRole, type KpiItem } from "@/lib/kpi/compute";

// Day 16: page-load hydration for the weekly-session chat. Returns this
// week's persisted transcript (or `{ transcript: null }` for a user with
// no session yet this week) so a fresh page load can resume the
// conversation instead of always starting a brand-new one -- the actual
// "persists through Sunday night, or until a new week's session starts"
// behavior falls straight out of keying the lookup on the current
// week_start, no separate expiry needed (see the migration's header
// comment). Read-only; writes only ever happen from /step and /confirm.
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const url = new URL(request.url);
  const tzParam = url.searchParams.get("timeZone");
  const timeZone = tzParam && tzParam.trim() ? tzParam.trim() : undefined;
  const now = new Date();
  const weekStart = planningWeekStart(now, timeZone);
  const weekLabel = formatPlanningWeekRange(planningWeekStartDate(now, timeZone), timeZone);
  const transcript = await getWeeklySessionTranscript(supabase, user.id, weekStart);
  const committedActions = await getCommittedPlanActions(supabase, user.id, weekStart);

  // Freemium: lets the page render the limit card on load instead of
  // discovering it via a 402 from /step. `reached` uses the same rule /step
  // enforces -- an in-progress round or an already-completed week is never
  // "reached", even for a free user at the limit.
  let freeTier: { reached: boolean; completedSessions: number; limit: number } | null = null;
  try {
    const access = await loadFreeTierAccess(supabase, user.id, user.email);
    freeTier = {
      reached: isNewSessionBlocked(access, roundStateOf(transcript)),
      completedSessions: access.completedSessions,
      limit: access.limit,
    };
    if (freeTier.reached) {
      await captureServerEvent({
        distinctId: user.id,
        event: "free_limit_reached",
        properties: { completedSessions: access.completedSessions, source: "page_load" },
      }).catch((err) => console.error("[weekly-session/transcript] analytics failed:", err));
    }
  } catch (error) {
    // Hydration shouldn't fail over this; /step still enforces server-side.
    console.error("[weekly-session/transcript] free-tier check failed:", error);
  }

  // Feature: role-priority reorder screen (see RolePriorityScreen.tsx),
  // shown only when a brand-new week's session is about to start -- no
  // transcript yet, or one with no turns in it. Computed only in that
  // case: every other page load (resuming mid-session, mid-week addendum)
  // has no use for it, so skip the extra KPI query. Same
  // getLastWeekContext + computeKpisForRoles recipe confirm/route.ts uses
  // for the session-recap email -- one source of truth for "what did last
  // week look like per role".
  const needsLastWeekStats = !transcript || (transcript.display_turns?.length ?? 0) === 0;
  let lastWeekStats: { role: string; numerator: number; denominator: number; percent: number | null }[] = [];
  if (needsLastWeekStats) {
    const [lastWeek, onboarding] = await Promise.all([
      getLastWeekContext(supabase, user.id, now, timeZone),
      getOnboardingAnswers(supabase, user.id),
    ]);
    if (lastWeek && onboarding) {
      const kpiItems: (KpiItem & { role: string })[] = lastWeek.items.map((i) => ({
        role: i.role,
        type: i.type,
        done: i.done,
        percent: i.percent,
      }));
      lastWeekStats = computeKpisForRoles(onboarding.roles, groupItemsByRole(kpiItems));
    }
  }

  if (!transcript) {
    return NextResponse.json({
      weekStart,
      weekLabel,
      committedActions,
      freeTier,
      lastWeekStats,
      transcript: null,
    });
  }

  return NextResponse.json({
    weekStart,
    weekLabel,
    committedActions,
    freeTier,
    lastWeekStats,
    transcript: {
      weekStart: transcript.week_start,
      displayTurns: transcript.display_turns,
      actionsSoFar: transcript.actions_so_far,
      completedThisWeek: transcript.completed_at !== null,
      pendingProposed: transcript.pending_proposed,
      pendingSessionActions: transcript.pending_session_actions,
    },
  });
}
