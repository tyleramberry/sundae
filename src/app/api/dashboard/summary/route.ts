import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { startOfWeek } from "@/lib/google/calendar";
import { getLastWeekContext, toDateOnly } from "@/lib/weeklySession/persist";
import { computeRoleKpi, type KpiItem } from "@/lib/kpi/compute";
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

  const nowWeekStart = startOfWeek(new Date());

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

  return NextResponse.json({ lastWeekPercent, sixWeekAveragePercent, streakWeeks });
}
