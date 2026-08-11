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
