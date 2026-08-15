import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { planningWeekStartDate } from "@/lib/weeklySession/week";
import { computeRoleKpi, type KpiItem } from "@/lib/kpi/compute";
import { toDateOnly } from "@/lib/weeklySession/persist";
import type { ActionType } from "@/lib/engine/weeklySessionTypes";

// Day 15's 6-week trend, read by /dashboard/[role]/trend. Per the MVP spec:
// - Shows completion PERCENTAGE per week, not raw count (role size varies
//   week to week).
// - The current week is included and live.
// - A week with 0 rows (nothing planned) is "no data", not 0%.
// - A user active fewer than 6 weeks sees only the weeks that actually
//   exist -- no padded weeks before their first one.
type WeekPoint = {
  weekStart: string;
  numerator: number;
  denominator: number;
  percent: number | null; // null = no data
};

function subWeeks(date: Date, weeks: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() - weeks * 7);
  return d;
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const role = new URL(request.url).searchParams.get("role");
  if (!role) {
    return NextResponse.json({ error: "Missing `role` query param." }, { status: 400 });
  }

  // Earliest week THIS ROLE has ever had an item -- clamps the 6-week
  // window so we never show weeks from before the role existed. Scoped to
  // `role`, not just `user_id`: a role that joined later than the rest of
  // the user's roles (added in a later week's session) has to get its own
  // start date, or it inherits the account's overall earliest role instead
  // and ends up padded with "no data" weeks it was never actually part of.
  const { data: earliest, error: earliestError } = await supabase
    .from("weekly_items")
    .select("week_start")
    .eq("user_id", user.id)
    .eq("role", role)
    .order("week_start", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (earliestError) {
    return NextResponse.json({ error: earliestError.message }, { status: 500 });
  }

  if (!earliest) {
    return NextResponse.json({ role, weeks: [] as WeekPoint[] });
  }

  const currentWeekStart = toDateOnly(planningWeekStartDate());
  const currentWeekDate = planningWeekStartDate();
  const candidateStarts: string[] = [];
  for (let i = 5; i >= 0; i--) {
    candidateStarts.push(toDateOnly(subWeeks(currentWeekDate, i)));
  }
  const weekStarts = candidateStarts.filter((w) => w >= earliest.week_start);

  const { data: rows, error } = await supabase
    .from("weekly_items")
    .select("week_start, type, done, percent")
    .eq("user_id", user.id)
    .eq("role", role)
    .is("removed_at", null)
    .in("week_start", weekStarts);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const byWeek = new Map<string, KpiItem[]>();
  for (const row of rows ?? []) {
    const list = byWeek.get(row.week_start as string) ?? [];
    list.push({
      type: row.type as ActionType,
      done: row.done as boolean,
      percent: row.percent as number | null,
    });
    byWeek.set(row.week_start as string, list);
  }

  const weeks: WeekPoint[] = weekStarts.map((weekStart) => {
    const items = byWeek.get(weekStart);
    if (!items || items.length === 0) {
      return { weekStart, numerator: 0, denominator: 0, percent: null };
    }
    const kpi = computeRoleKpi(role, items);
    return {
      weekStart,
      numerator: kpi.numerator,
      denominator: kpi.denominator,
      percent: kpi.percent,
    };
  });

  return NextResponse.json({ role, currentWeekStart, weeks });
}
