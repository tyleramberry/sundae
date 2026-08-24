import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { planningWeekStartDate } from "@/lib/weeklySession/week";
import {
  getLastWeekContext,
  getMasterScoreHistory,
  toDateOnly,
} from "@/lib/weeklySession/persist";
import { getOnboardingAnswers } from "@/lib/onboarding/persist";
import {
  computeKpisForRoles,
  computeMasterScore,
  computeRoleKpi,
  groupItemsByRole,
  type KpiItem,
} from "@/lib/kpi/compute";
import type { ActionType } from "@/lib/engine/weeklySessionTypes";

// Account-wide dashboard stats (Day 16 "make it cooler" pass): last week's
// pooled completion rate, the 6-week pooled average (same window as the
// per-role trend view, see /api/dashboard/trend), and the user's current
// weekly-planning streak. Pooling reuses computeRoleKpi with a synthetic
// "_pooled" label instead of reimplementing the numerator/denominator math
// -- per-role and account-wide completion are the same math, just a
// different set of items going in. Per-role breakdowns (strongest/weakest
// role, habit/goal/project mix) don't need their own query -- the dashboard
// page already has everything for those from /api/dashboard's response.
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const nowWeekStart = planningWeekStartDate();

  // ---- Last week's pooled completion rate ----
  const lastWeekContext = await getLastWeekContext(supabase, user.id);
  const lastWeekPercent = lastWeekContext
    ? computeRoleKpi(
        "_pooled",
        lastWeekContext.items.map((i) => ({ type: i.type, done: i.done, percent: i.percent })),
      ).percent
    : null;

  // ---- 6-week pooled average -- same current + previous-5 window as
  // /api/dashboard/trend, just pooled across every role instead of one. A
  // week with nothing planned is excluded from the average entirely (per
  // MVP spec, "no data" isn't the same as a bad week) rather than counted
  // as 0%. ----
  const candidateStarts: string[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(nowWeekStart);
    d.setDate(d.getDate() - i * 7);
    candidateStarts.push(toDateOnly(d));
  }

  const { data: sixWeekRows, error: sixWeekError } = await supabase
    .from("weekly_items")
    .select("week_start, type, done, percent")
    .eq("user_id", user.id)
    .is("removed_at", null)
    .in("week_start", candidateStarts);

  if (sixWeekError) {
    return NextResponse.json({ error: sixWeekError.message }, { status: 500 });
  }

  const byWeek = new Map<string, KpiItem[]>();
  for (const row of sixWeekRows ?? []) {
    const list = byWeek.get(row.week_start as string) ?? [];
    list.push({
      type: row.type as ActionType,
      done: row.done as boolean,
      percent: row.percent as number | null,
    });
    byWeek.set(row.week_start as string, list);
  }

  const weekPercents = candidateStarts
    .map((w) => byWeek.get(w))
    .filter((items): items is KpiItem[] => !!items && items.length > 0)
    .map((items) => computeRoleKpi("_pooled", items).percent)
    .filter((p): p is number => p !== null);

  const sixWeekAveragePercent =
    weekPercents.length > 0
      ? Math.round(weekPercents.reduce((a, b) => a + b, 0) / weekPercents.length)
      : null;

  // ---- Weekly-planning streak -- consecutive weeks (any role, ignoring
  // removed_at: a calendar block getting cleaned up later doesn't erase
  // that a session ran that week) with at least one confirmed item.
  // Duolingo-style current-streak: the still-in-progress current week
  // doesn't break the streak just for not having anything logged yet -- it
  // only extends the streak once it actually has something in it. No
  // 6-week cap here, unlike the average above -- a streak should read as
  // long as it actually is. ----
  const { data: allWeekRows, error: allWeeksError } = await supabase
    .from("weekly_items")
    .select("week_start")
    .eq("user_id", user.id);

  if (allWeeksError) {
    return NextResponse.json({ error: allWeeksError.message }, { status: 500 });
  }

  const weeksWithSessions = new Set((allWeekRows ?? []).map((r) => r.week_start as string));

  let streakWeeks = 0;
  const cursor = new Date(nowWeekStart);
  if (weeksWithSessions.has(toDateOnly(cursor))) {
    streakWeeks = 1;
  }
  cursor.setDate(cursor.getDate() - 7);
  while (weeksWithSessions.has(toDateOnly(cursor))) {
    streakWeeks += 1;
    cursor.setDate(cursor.getDate() - 7);
  }

  // ---- Spec #2 hero: master weekly score (live for the current week)
  // + persisted history for prior weeks. Live compute so the hero
  // number stays fresh as items get marked done during the week, even
  // though the transcript row's `master_score` snapshot was frozen at
  // close time. History reads from weekly_session_transcripts per PRD;
  // rows with a null master_score are skipped by getMasterScoreHistory
  // (pre-migration or no-score-supplied rounds). computeMasterScore
  // lives in compute.ts per Quinton's Invariant 2 amendment.
  const onboardingForScore = await getOnboardingAnswers(supabase, user.id).catch(() => null);
  const currentWeekRoles = onboardingForScore?.roles ?? [];
  // sixWeekRows above deliberately omits `role`; fetch it fresh here so
  // groupItemsByRole gets a real key. Bounded to this week only, so
  // keeping the KPI compute path in one place is worth the extra query.
  const currentWeekStartISO = toDateOnly(nowWeekStart);
  const { data: currentWeekRowsWithRole } = await supabase
    .from("weekly_items")
    .select("role, type, done, percent")
    .eq("user_id", user.id)
    .eq("week_start", currentWeekStartISO)
    .is("removed_at", null);
  const currentKpiItems: (KpiItem & { role: string })[] = (currentWeekRowsWithRole ?? []).map(
    (row) => ({
      role: row.role as string,
      type: row.type as ActionType,
      done: row.done as boolean,
      percent: row.percent as number | null,
    }),
  );
  const currentRoleKpis = currentWeekRoles.length > 0
    ? computeKpisForRoles(currentWeekRoles, groupItemsByRole(currentKpiItems))
    : [];
  const masterScore = computeMasterScore(currentRoleKpis);

  const scoreHistoryRaw = await getMasterScoreHistory(supabase, user.id, 6);
  // Oldest-first, and drop the current-week row if present -- the hero
  // already shows the fresh live value for this week, no need to
  // double-count it in the sparkline series. Sparkline consumer will
  // append the live masterScore as its final point.
  const masterScoreHistory = scoreHistoryRaw
    .filter((r) => r.weekStart !== currentWeekStartISO)
    .reverse()
    .map((r) => ({ weekStart: r.weekStart, masterScore: r.masterScore }));

  return NextResponse.json({
    lastWeekPercent,
    sixWeekAveragePercent,
    streakWeeks,
    masterScore,
    masterScoreHistory,
  });
}
