# PRD: Honor stated schedule on proposal

**Status:** Ready for engineering  
**Priority:** P0  
**Phase:** MVP  
**Feedback:** FB-13, FB-15 (evidence: FB-18 — screenshots promised, not attached)  
**Tester:** Brooklyn, first weekly session  
**Owner surfaces:** `src/lib/planning/blocks.ts`, `src/lib/engine/weeklySession.ts`, `src/app/api/weekly-session/propose/route.ts`

## Problem

Brooklyn told Sundae when things should happen (afternoon; Wednesday; Saturday). The **draft** week showed different times and days (6–8am; Tuesday; Monday) plus an **extra Tuesday** she did not ask for.

Confirm-before-write still exists — she could edit — but a draft that ignores her words is a **trust-breaker**. People will not confirm a plan they do not believe. “You can fix it on the confirm screen” is not the fix.

This is not a request for auto-write, Apple Calendar, or a smarter ML scheduler. It is: **the proposal must be a faithful rendering of what she already said**, using Google Calendar only to detect conflicts and gaps — not to silently relocate her life to 6am Monday.

## Evidence

| ID | Report | Notes |
| --- | --- | --- |
| FB-13 | Afternoon planned → draft blocks 6–8am | Verbal only |
| FB-15 | Wed → Tue; Sat → Mon; extra Tuesday | Verbal only |
| FB-18 | Calendar screenshots mentioned in debrief, never attached | Do not block the bug on photos; instrument the next repro |

Related: FB-08 (day-parts currently illegal in the engine, which can cause omitted `preferredTime` and then a default clock). Ship this PRD **together with** [day-part-and-flexible-time.md](day-part-and-flexible-time.md) so “afternoon” is both captured and honored.

Stay-on-task in the conversation is a KEEP and is out of scope here.

## Goals

- A named **weekday** on a single-block Habit/Goal appears on that weekday in `/propose` output, unless the user later edits it.
- A stated **clock or day-part window** (once captured — see day-part PRD) is the start of the draft block, not “first empty morning.”
- If the exact slot conflicts with an existing Google event, keep the slot and set `conflictsWith` — do **not** move the block to a free morning.
- Extra occurrences only exist when `cadenceCount` (or equivalent) is what the user agreed to; extras are visible and editable before confirm.
- Engineering can diagnose a mismatch from structured logs (timezone, `weekday`, `preferredTime`, window start/end, cadence) without a screenshot.

## Non-goals

- Writing the calendar without confirm.
- Rebuilding Google OAuth or adding Apple Calendar.
- Month-ahead visualization (see [calendar-context-while-planning.md](calendar-context-while-planning.md)).
- ML “better times for you.”
- Push/SMS reminders.
- Treating confirm-screen edits as a substitute for a correct first draft.

## User stories

1. As Brooklyn, when I say “Wednesday afternoon,” I see a draft block on **Wednesday** inside the **afternoon window**, not Tuesday 6am.
2. As Brooklyn, when I say “Saturday,” I do not get **Monday** because Saturday looked tight or “past.”
3. As Brooklyn, if Saturday 2pm overlaps something, I see **that overlap called out** on the confirm UI, and I choose double-book / move / drop — Sundae does not choose Monday for me.
4. As Brooklyn, I never see a bonus Tuesday unless I asked for multiple times this week (habit cadence) and can see that count.
5. As an engineer, I can replay propose with her captured actions and timezone and get the same draft.

## Current behavior vs desired

### Current

- Engine (`src/lib/engine/weeklySession.ts`) records `weekday` (0=Sunday…6=Saturday) and `preferredTime` as `"HH:MM"` local. Day-parts are **forbidden**; only “whenever, you pick” after being asked may omit `preferredTime`.
- `/api/weekly-session/propose` is read-only slotting via `proposeActionBlocks` in `src/lib/planning/blocks.ts`.
- Header comment in `blocks.ts`: the old **earliest-gap cascade** (try exact time, then another time that day, then any slot, then other days) was rewritten after a bug-bash: exact day+time, flag `conflictsWith`, never silently move. Default clock if `preferredTime` is missing: **9:00** (`DEFAULT_FALLBACK_MINUTES`), not 6:00. Default day order when no day named: Monday-first `[1, 2, 3, 4, 5, 0, 6]`.
- Multi-block habits still fill extra days from `dayOrder` when `cadenceCount` > 1. Single-block + named day is supposed to try **only that day**.
- `src/lib/weeklySession/week.ts` plans next week if fewer than two days remain after today (Fri/Sat). Timezone must be the user’s IANA zone, not Vercel UTC.
- Busy times are injected into chat (`calendarSummary.ts`) but that does not place blocks.
- Confirm (`/api/weekly-session/confirm`) writes Google Calendar + `weekly_items` only after the user confirms.

### Desired

- No remaining path that **relocates** a named day or a captured window to “a free morning,” including omitted `preferredTime`, UTC parsing, wrong day offset, or habit leftover cadence.
- If `preferredTime` is missing, **do not** invent 6–8am or 9am without labeling the block as “Sundae picked a start inside your window / no preference.” Prefer the day-part PRD’s window start over a silent default.
- Saturday named + unreachable (past, outside window): **surface that on confirm** (“Saturday already passed this planning week”) and let her pick another day — do not fold onto Monday via `DEFAULT_DAY_ORDER`.
- Extra Tuesday: either `cadenceCount` is wrong (engine) or leftover placement (blocks). Both must be test-covered.
- Draft UI (`WeekCalendarGrid`, `WeeklyPlanPanel`) shows the same day/time as propose JSON.

## Hypotheses (investigate in this order)

Screenshots were **not** attached (FB-18). Use these as the debug checklist; more than one can be true.

1. **Timezone / process zone.** `preferredTime` or week bounds computed in UTC; afternoon in America/* becomes morning UTC or a different calendar day. `week.ts` already documents UTC-vs-user “today.” Confirm propose/confirm/step all pass the same IANA zone.
2. **Weekday off-by-one.** Engine `weekday` vs Luxon `DateTime.weekday` (1=Mon…7=Sun) vs `Date.getDay()` (0=Sun). `zonedWeekday` uses `% 7`. Any caller using ISO weekday as a Sunday-based offset shifts Wed→Tue (and similar).
3. **Window start vs named day.** `placeAt` uses day offset from Sunday `windowStart`. If `windowStart` is the wrong Sunday (Fri/Sat roll-forward, or UTC Sunday), Wednesday’s offset lands Tuesday.
4. **Earliest-gap leftover.** Confirm no client still calls an old cascade; confirm `parseTimeToMinutes` failure doesn’t pair with a morning cluster copied from existing events (FB-13’s **6–8am** does not match the 9:00 constant — may be existing “Wake up / pray” style events or a mis-captured window, per comments in `blocks.ts`).
5. **Habit cadence dump.** `cadenceCount` inferred high (“this week,” “a few times,” “every”). Extra blocks walk `dayOrder` → Monday after a failed Saturday, Tuesday as the next dump. Matches FB-15 extra Tuesday + Sat→Mon.
6. **Engine omitted `preferredTime`** while still proposing (stabilizeActions strips guesses while asking). Propose then uses fallback minutes. Combined with FB-08’s interrogation, afternoon never lands on the action.
7. **Relative language** (“tomorrow,” “tonight”) via `reconstructFromText` / `weekdayFromText` disagreeing with structured `weekday`.

## Requirements

### Placement integrity (P0)

1. For `type` Habit or Goal with a structured `weekday` set: the **first** (and, if `cadenceCount === 1`, **only**) proposed block’s zoned weekday **equals** that value.
2. Do not substitute `DEFAULT_DAY_ORDER` for a named single-day ask when `placeAt` returns null (past / outside window). Return zero blocks for that occurrence and a machine-readable reason (`unplaceable: "past" | "outside_window"`) so the confirm UI can explain — never a different weekday.
3. For captured `preferredTime`, proposed `start` minutes-of-day in the user timezone match it (duration from `durationMinutes`).
4. Day-part / flexible window (after day-part PRD): proposed `start` lies inside the window; default to window start if the scheduler is picking.
5. `conflictsWith` remains the collision policy. No new “find a free morning” branch.
6. `/propose` stays read-only. `/confirm` remains the only `createCalendarEvent` + `weekly_items` write path.

### Cadence extras (P0)

7. `cadenceCount` for habits must match user-visible language (every day → 7, MW F → 3, once → 1). If the model is unsure, **ask** or default to 1 — do not invent a second Tuesday.
8. Confirm UI lists each occurrence with weekday + time. User can delete an extra before confirm.
9. Engine must not silently change a locked item’s `weekday` / `preferredTime` / `cadenceCount` on later turns unless the user revises that item (`stabilizeActions` already aims at this — keep it).

### Observability (P0 for the next beta)

10. Log (dev and beta): user timezone, `weekStart`/`weekEnd`, each action’s `weekday`, `preferredTime`, `cadenceCount`, and each proposed block’s ISO start. Enough to debug without FB-18 screenshots.
11. Add regression tests in `src/lib/planning/blocks.test.ts` (and engine stabilize tests if the bug is classification):
    - Wednesday + afternoon window (or 14:00) → Wednesday afternoon, not Tuesday 6am.
    - Saturday named, Saturday slot free → Saturday, not Monday.
    - Saturday named, Saturday in the past relative to `now` → unplaceable / empty blocks, not Monday.
    - Habit cadence 1 vs 3: no extra Tuesday when count is 1.
    - Timezone: America/Denver afternoon vs UTC.

### Copy on confirm when placement cannot honor

12. If unplaceable: “Saturday already passed in this planning week. Pick another day, or this item stays off the calendar.” Never a silent move.

## UX copy sketches

**Conflict (keep existing policy, make it obvious):**

> This Wednesday 2:00–3:00pm overlaps **Team standup** (1:30–2:30pm). Keep it, move it, or drop it — Sundae won’t slide it to Tuesday morning.

**Unplaceable Saturday:**

> You asked for Saturday, but this plan is for a week where Saturday is already over. Choose a day that’s still ahead, or skip this block.

**Cadence the user can see:**

> Workout — Habit · 3 times this week · Wed 2pm, Fri 2pm, Sat 2pm  
> Remove any you didn’t mean.

**Do not say:**

> We found a better time at 6am.

## Success metrics

- Next Brooklyn-like session: **zero** “wrong day” or “wrong day-part” reports on the first draft (edits for preference are OK).
- QA checklist on `docs/smoke-test.md` (or equivalent): afternoon + named weekday + Saturday edge + cadence 1.
- Propose logs for a seeded account show weekday/time match captured actions 100% in the fixture suite.
- Confirm rate is not the north star here; **draft acceptance without day/time edits** on gold-path fixtures is.

Activation metric (trial + onboarding + first session) is unchanged; this PRD unblocks trust so that first session is completable.

## Risks

- Fixing Sat→Mon by refusing `DEFAULT_DAY_ORDER` fallback may leave habits with fewer blocks than `cadenceCount` — confirm UI must explain rather than silently under-schedule.
- Day-part PRD changes capture; if this ships first, afternoon may still be missing `preferredTime`. Coordinate.
- Over-logging PII (event titles) in production — log ids/times; titles OK in beta.
- Luxon week vs Sunday-start week is easy to regress in tests that use UTC.

## Dependencies

- [day-part-and-flexible-time.md](day-part-and-flexible-time.md) for capturing “afternoon” as a window.
- [calendar-context-while-planning.md](calendar-context-while-planning.md) for showing *why* a slot conflicts (existing events). Does not replace this bugfix.
- User timezone already threaded (or must be) through week helpers, Google reads (`src/lib/google/calendar.ts`), and propose.

## Open questions

1. When Saturday is in the past but she is planning “next week” via Fri/Sat roll-forward, should “Saturday” mean **next** Saturday (inside the new window) — likely yes if the window is next week.
2. Should omitted `preferredTime` after “you pick” prefer midday vs 9am vs first gap **inside a default work window**? Day-part PRD should define the window; this PRD only forbids lying about a stated afternoon.
3. Is 6–8am specifically colliding with existing morning events on her calendar (titles in `conflictsWith`) rather than a fallback constant? Next session log will tell.

## Suggested implementation surfaces

| Area | Where |
| --- | --- |
| Exact placement, day order, fallback minutes, `conflictsWith` | `src/lib/planning/blocks.ts`, `src/lib/planning/blocks.test.ts` |
| Week bounds + timezone | `src/lib/weeklySession/week.ts` |
| Action shape | `src/lib/engine/weeklySessionTypes.ts`, `src/lib/weeklySession/parseActions.ts` |
| Stop locked-field drift | `src/lib/engine/stabilizeActions.ts` |
| Relative day words | `src/lib/planning/reconstructFromText.ts`, `weekdayFromText` in `blocks.ts` |
| Read-only slotting API | `src/app/api/weekly-session/propose/route.ts` |
| Writes (do not add a second path) | `src/app/api/weekly-session/confirm/route.ts`, `src/lib/weeklySession/persist.ts`, `src/lib/google/calendar.ts` |
| Draft UI | `src/components/WeekCalendarGrid.tsx`, `src/components/WeeklyPlanPanel.tsx`, `src/app/(app)/weekly-session/page.tsx` |
| Engine capture of day/time | `src/lib/engine/weeklySession.ts` (prompt + tool schema) — change day-part rule only per the day-part PRD |
| Busy context (not placement) | `src/lib/weeklySession/calendarSummary.ts` |
