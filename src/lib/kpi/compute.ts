// Shared KPI math for the current-week dashboard (Day 12) and the 6-week
// trend view (Day 15). One definition so the live tile and the trend bars
// can never disagree on what "done" means for a role.

import type { ActionType } from "@/lib/engine/weeklySessionTypes";

export type KpiItem = {
  type: ActionType;
  done: boolean;
  percent: number | null;
};

export type RoleKpi = {
  role: string;
  numerator: number;
  denominator: number;
  // null when denominator is 0 (nothing planned) -- trend view renders
  // that as "no data", not 0%. Dashboard still shows the 0/0 tile.
  percent: number | null;
};

export function isItemComplete(item: KpiItem): boolean {
  if (item.type === "project") return (item.percent ?? 0) >= 100;
  return item.done;
}

export function computeRoleKpi(role: string, items: KpiItem[]): RoleKpi {
  const denominator = items.length;
  const numerator = items.filter(isItemComplete).length;
  return {
    role,
    numerator,
    denominator,
    percent: denominator === 0 ? null : Math.round((numerator / denominator) * 100),
  };
}

// Every role from onboarding still gets a tile, even at 0/0 -- see MVP
// spec "Every role shows a KPI, even at 0/0."
export function computeKpisForRoles(
  roles: string[],
  itemsByRole: Map<string, KpiItem[]>,
): RoleKpi[] {
  return roles.map((role) => computeRoleKpi(role, itemsByRole.get(role) ?? []));
}

export function groupItemsByRole<T extends { role: string }>(
  items: T[],
): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const list = map.get(item.role) ?? [];
    list.push(item);
    map.set(item.role, list);
  }
  return map;
}

// Master weekly completion score (spec #2, PRD). Simple equal-weighted
// average of each role's completion percentage, rounded to an integer
// 0-100 so the dashboard hero can render it directly. Roles with a null
// percent (denominator 0 -- nothing planned for that role this week) are
// EXCLUDED from the average rather than counted as 0 -- the "null vs 0"
// distinction is load-bearing everywhere else in this file, and treating
// "nothing planned" as failing would punish users for onboarding roles
// they didn't plan against this week. Returns 0 when every role is
// null or the input is empty (avoids NaN from an empty divisor).
export function computeMasterScore(roleKpis: RoleKpi[]): number {
  const scored = roleKpis.filter((r) => r.percent !== null);
  if (scored.length === 0) return 0;
  const total = scored.reduce((sum, r) => sum + (r.percent as number), 0);
  return Math.round(total / scored.length);
}
