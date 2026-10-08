# PRD: Explain goal types and KPI

**Status:** Ready for engineering  
**Priority:** P2  
**Phase:** MVP  
**Feedback:** FB-09, FB-17  
**Tester:** Brooklyn, first weekly session  

## Problem

The engine **classifies** each action as a Habit, Goal, or Project. Brooklyn never picks a type — then she sees different shapes (many calendar blocks vs one vs a slider) and a **weekly number** that reads like a sleep-app score (opaque 0–100 quality), not “X of Y things I committed to.”

Two confusions, one education surface:

1. **What are these types in human language?**
2. **What is the weekly score?** It is a **completion fraction**, and an empty week is **no data**, not a failing 0%.

KPI math has one source of truth: `src/lib/kpi/compute.ts`. This PRD does **not** invent a parallel formula in the UI. `percent: null` (denominator 0) must stay distinct from `0` (planned, none done).

## Evidence

| ID | Report |
| --- | --- |
| FB-09 | Goals vs habits (and the unnamed third: projects) unexplained |
| FB-17 | Weekly score interpreted as a sleep-style score |

Related: FB-07 orientation; post-confirm loop can reuse one sentence.

## Goals

- Explain types in **user language** at the moment of classification and on dashboard/confirm — without a type-picker.
- Show the **fraction** (numerator/denominator) wherever a percent is shown for a role that has items.
- Empty week / role with nothing planned: **no data**, not 0% on trend; dashboard may still show the 0/0 tile per spec.
- Master “weekly score” copy must not sound like sleep quality. If every role is empty, do not present `computeMasterScore`’s numeric `0` as a grade.

## Non-goals

- Letting the user choose the type in a form.
- Changing the pooling formula (one KPI per role; habits+goals+projects).
- Partial credit for project sliders in the fraction (slider is UX; KPI ticks at 100% only) — unless a future spec says otherwise; **this PRD does not change that math**.
- ML personalization of what’s a habit.
- Yearly goals product.

## User stories

1. As Brooklyn, when Sundae treats “gym most mornings” as a Habit, I see: “We’ll put several blocks on the calendar — each one you mark done counts.”
2. As Brooklyn, when something is a one-off, I see: “One block. Done or not.”
3. As Brooklyn, when something isn’t a calendar block, I see: “This stays in the app as a progress slider. It counts for your week only when you hit 100%.”
4. As Brooklyn, the big number is explained as **“3/10 planned items done”** (or per-role 2/7), not “your score is 73 — great sleep.”
5. As Brooklyn, a week I didn’t plan is a blank on the 6-week trend, not a red zero.

## Current behavior vs desired

### Current

- Types defined in `docs/MVP-spec.md` and classified in `src/lib/engine/weeklySession.ts`. User never picks.
- `WeeklyPlanPanel` badges: Habit / Goal / Project with cadence chips.
- Dashboard: `KpiRing`, `DashboardStats`, `TypeBreakdown` (already shows `done/total` on mix bars), trend `src/app/(app)/dashboard/[role]/trend/page.tsx` + `TrendChart.tsx`.
- `computeRoleKpi`: `percent: null` when `denominator === 0`.
- `computeMasterScore`: averages roles with non-null percent; **returns 0 when none scored** — dangerous if the hero ring treats 0 as a score.
- Logging completeness via `isItemComplete` (projects at 100%).

### Desired

- Short definitions on: first time a type appears in the session panel; confirm summary; dashboard legend; trend empty state.
- Hero / master score: if no roles have a denominator, show **“No plan this week yet”** / “—” not `0%`.
- Role tiles: show `numerator/denominator` as the primary label; percent is secondary (“2/7 · 29%”). 0/0 tile: “Nothing planned” not “0% complete.”
- Trend: keep spec — 0/0 weeks are no data. Verify `TrendChart` / API (`/api/dashboard/trend`) never coerce null to 0.

## Requirements

1. **Do not** change `computeRoleKpi` / `isItemComplete` pooling rules. If master-score empty case should return `null` instead of `0` for display, do that **in compute.ts** so dashboard and trend cannot disagree — empty-all-roles is “no data,” not a 0% average. That is a display-correctness fix aligned with `percent: null ≠ 0`, not a new KPI definition.
2. Copy glossary (use consistently):

   | Internal | User language |
   | --- | --- |
   | Habit | Repeating this week — one calendar block per time you committed |
   | Goal | One thing, one block |
   | Project | Bigger / messier — a slider in the app, not a timed block |

3. Engine `reply` may use those phrases when classifying; do not ask “is this a habit?”
4. Dashboard + trend consume `src/lib/kpi/compute.ts` only.
5. TypeBreakdown already has fractions; add a one-line caption: “Mix of repeating blocks, one-offs, and sliders — not a wellness score.”
6. No new goal types.

## UX copy sketches

**First Habit chip tooltip / panel hint:**

> Habit: repeating. Each calendar block is one checkmark toward this role’s week.

**Goal:**

> Goal: once. One block, one checkmark.

**Project:**

> Project: no calendar time. Drag the slider in Daily follow-ups; it counts when you hit 100%.

**Dashboard hero (has data):**

> This week: **8/15** planned items done across your roles. That’s your week — not a sleep score.

**Dashboard hero (nothing planned):**

> No items planned this week — nothing to score yet.

**0/0 role tile:**

> Founder · nothing planned this week

**Trend empty week:**

> No data (nothing planned)

**Banned:**

> Your Sundae score is 82. Keep it up!  
> You scored 0 this week. (when they simply hadn’t planned)

## Success metrics

- Next debrief: she can explain in her own words that the number is done/planned.
- QA: fixture with no `weekly_items` does not show a hero **0%** as a failing grade.
- Trend fixture 0/0 week renders no-data, not 0%.
- No type-picker control in the weekly session.

## Risks

- Changing `computeMasterScore(empty) → null` needs a coordinated UI (TypeScript + rings). Do not leave `Math.round` on null.
- Over-explaining in chat lengthens FB-07; prefer tooltips + one dashboard sentence + one post-confirm sentence.

## Dependencies

- [post-plan-operating-loop.md](post-plan-operating-loop.md) — shared “not a sleep grade” line.
- Spec: `docs/MVP-spec.md` Goal types & KPI logic; `docs/weekly-session-flow.md`.

## Open questions

1. Should project slider partial % show on the dashboard tile tooltip? Already granular in-app; KPI fraction stays binary at 100%. **Keep spec.**
2. Master score equal-weight roles vs item-weight — **do not change** in this PRD.

## Suggested implementation surfaces

| Area | Where |
| --- | --- |
| Math only | `src/lib/kpi/compute.ts`, `src/lib/kpi/compute.test.ts` |
| Live tiles | `src/app/(app)/dashboard/page.tsx`, `src/components/KpiRing.tsx`, `DashboardStats.tsx`, `TypeBreakdown.tsx` |
| Trend | `src/app/(app)/dashboard/[role]/trend/page.tsx`, `TrendChart.tsx`, `Sparkline.tsx`, `/api/dashboard/trend`, `/api/dashboard/summary` |
| Session badges | `src/components/WeeklyPlanPanel.tsx`, `WeekCalendarGrid.tsx` |
| Logging | `src/app/(app)/daily-follow-ups/page.tsx` |
| Classification copy | `src/lib/engine/weeklySession.ts` (reply guidance only) |
