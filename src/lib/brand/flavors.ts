// Per-role accent colors for the signed-in app (dashboard rings, follow-up
// role labels). Roles are assigned by position, so the same role keeps its
// color as long as the user's role order doesn't change. Strawberry and
// pistachio match the landing page's calendar blocks; the rest extend the
// set with colors that stay readable as a ring on the canvas background
// (vanilla itself is too pale for that, so caramel stands in for it).
export const ROLE_FLAVORS = [
  { name: "strawberry", hex: "#FF5C8A" },
  { name: "pistachio", hex: "#7FB35F" },
  { name: "caramel", hex: "#E3A33B" },
  { name: "blueberry", hex: "#6C7FE0" },
  { name: "mint", hex: "#3FB39E" },
  { name: "grape", hex: "#A46BD6" },
] as const;

export function flavorFor(index: number): string {
  return ROLE_FLAVORS[index % ROLE_FLAVORS.length].hex;
}
