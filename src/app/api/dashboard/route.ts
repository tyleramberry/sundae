import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { startOfWeek } from "@/lib/google/calendar";
import { toDateOnly } from "@/lib/weeklySession/persist";
import { getOnboardingAnswers } from "@/lib/onboarding/persist";
import {
  computeRoleKpi,
  groupItemsByRole,
  type KpiItem,
} from "@/lib/kpi/compute";
import type { ActionType } from "@/lib/engine/weeklySessionTypes";

// Read-only current-week dashboard data (Day 12, scoped down for the Day 7
// demo): one KPI per role plus the items behind it. Every role from
// onboarding still gets a tile even at 0/0, per the MVP spec. Logging
// (checkbox/slider that moves the numerator) is a later pass -- this is the
// destination the weekly-session "done" screen now links to so the flow
// isn't a dead end.
type DashboardItem = {
  id: string;
  title: string;
  type: ActionType;
  done: boolean;
  percent: number | null;
};

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const weekStart = toDateOnly(startOfWeek(new Date()));

  const onboarding = await getOnboardingAnswers(supabase, user.id);
  const roles = onboarding?.roles ?? [];

  const { data, error } = await supabase
    .from("weekly_items")
    .select("id, role, type, title, done, percent")
    .eq("user_id", user.id)
    .eq("week_start", weekStart)
    .is("removed_at", null);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as (DashboardItem & { role: string })[];
  const byRole = groupItemsByRole(rows);

  // Union of onboarding roles and any role that actually has items this week
  // (covers a rollover under a role the user later renamed/dropped).
  const allRoles = [...new Set([...roles, ...rows.map((r) => r.role)])];

  const tiles = allRoles.map((role) => {
    const items = byRole.get(role) ?? [];
    const kpiItems: KpiItem[] = items.map((i) => ({
      type: i.type,
      done: i.done,
      percent: i.percent,
    }));
    const kpi = computeRoleKpi(role, kpiItems);
    return {
      role,
      numerator: kpi.numerator,
      denominator: kpi.denominator,
      percent: kpi.percent,
      items: items.map((i) => ({
        id: i.id,
        title: i.title,
        type: i.type,
        done: i.done,
        percent: i.percent,
      })),
    };
  });

  return NextResponse.json({ weekStart, roles: tiles });
}
