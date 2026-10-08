# PRD: Day-part and flexible time

**Status:** Ready for engineering  
**Priority:** P1 (pairs with P0 calendar honor)  
**Phase:** MVP  
**Feedback:** FB-08  
**Tester:** Brooklyn, first weekly session  

## Problem

Brooklyn said things like **“morning sometime”** and **“I don’t care / whenever.”** The weekly session kept asking for a **clock time**. That feels like an interrogation, lengthens the first sitting (FB-06/FB-07), and still produces a bad draft if the engine omits `preferredTime` and propose falls back to a default morning (FB-13).

Sundae’s job is specific calendar blocks, not a vague wish list — but **a window is specific enough to slot**. A second question for `2:17pm` when she already said “afternoon” is the wrong SMART bar.

## Evidence

| ID | Report |
| --- | --- |
| FB-08 | Morning sometime / don’t keep asking for a clock; “I don’t care” should be enough |

Related: FB-13 (afternoon → 6–8am) — without capturing day-parts, honor-schedule cannot place afternoon. FB-07 — extra questions inflate time commitment.

## Goals

- Treat day-parts and explicit no-preference as **first-class scheduling input**, not as “not done yet.”
- **Change the weekly-session engine rule** that currently forbids day-parts.
- Still emit **slottable** Habit/Goal blocks (concrete `start`/`end`) for `/propose`.
- Confirm screen remains **fully editable** (time, day, drop).
- One clarification max if the utterance is truly empty (“put it somewhere”).

## Non-goals

- Asking the user to pick Habit vs Goal vs Project.
- Auto-writing the calendar.
- Push notifications when the window arrives.
- ML of “her usual morning.”
- Voice or screenshot intake.
- Multi-turn bargaining about the “perfect” minute.

## User stories

1. As Brooklyn, when I say “Thursday morning sometime,” Sundae does **not** reply “what time Thursday morning?” It drafts a Thursday block in the morning window.
2. As Brooklyn, when I say “I don’t care, you pick,” Sundae picks a start **inside a default flexible window** that week (respecting busy times via propose, not by moving a stated window) and shows it on confirm for me to edit.
3. As Brooklyn, if I already said “7am,” Sundae does not also ask for a day-part.
4. As Brooklyn, I can still change 9:00am to 10:30am on the confirm grid before anything is written.

## Current behavior vs desired

### Current (must be called out: this PRD contradicts the prompt)

In `src/lib/engine/weeklySession.ts` (system prompt + tool schema):

- **“Every Habit/Goal action item needs a real clock time, not a day-part.”**
- Morning / afternoon / evening / “sometime this week” is **not** a time.
- Follow up until `preferredTime` is `"HH:MM"` or a tight window that can be anchored (“2–3pm” → `14:00`).
- **Never guess** a clock from a day-part; if the reply is still asking, strip `preferredTime` (`stabilizeActions.ts`).
- **Only exception:** user has **no preference after being asked** (“whenever, you pick”) — then omit `preferredTime` and let scheduling pick.

`proposeActionBlocks` then uses `parseTimeToMinutes(preferredTime) ?? DEFAULT_FALLBACK_MINUTES` (9:00).

Duration is a separate follow-up (`durationMinutes`) and stays.

### Desired engine rule (replace the paragraph above)

**A Habit/Goal is captured when Sundae has a slottable constraint, not necessarily a spoken `HH:MM`.**

Accept, in user language:

| User says | Capture | Propose |
| --- | --- | --- |
| “2pm”, “7:30”, “after 6:30pm date from 6–8” | `preferredTime` + duration as today | Exact start (range ⇒ start + duration) |
| “morning” / “sometime in the morning” | `timeWindow: morning` (see schema) | Start = window start, or first conflict-flagged exact start at window start |
| “afternoon” / “evening” / “night” | corresponding window | same |
| “I don’t care” / “whenever” / “you pick” **even without a prior clock question** | `timeFlexible: true` (omit clock) | Scheduler picks **within the default flexible window** for that day (see below), still exact ISO start on the draft |
| “2–3pm” | start + duration | as today |
| Truly nothing (no day-part, no clock, no flexible) | **one** question: “Any preference — morning, afternoon, or whenever?” | If they still don’t care, `timeFlexible` |

**Stop interrogating** once a row in that table applies. Do not ask “what time Thursday afternoon works best?” when afternoon is already stated.

Duration question remains unless the user already gave a length. Default duration if they also don’t care: existing batch default (today ~45 minutes unless `durationMinutes` is set) — do not add a third interrogation.

### Confirm

Unchanged policy: user edits blocks; `/confirm` is the write. Show the resolved clock so “whenever” is never a surprise 6am (see P0 PRD).

## Requirements

### Engine (channel-agnostic)

1. Update the system prompt in `src/lib/engine/weeklySession.ts` so day-parts **are** valid capture. Delete or invert the “not a day-part” rule. Keep Claude (no regex revival).
2. Extend `ClassifiedAction` in `weeklySessionTypes.ts` with an explicit window, for example:
   - `timeWindow?: "morning" | "afternoon" | "evening" | "anytime"`
   - `preferredTime?: string` still `"HH:MM"` when known
   - `timeFlexible?: boolean` for “you pick”
   - Invariant: if `preferredTime` is set, it wins; else `timeWindow`; else `timeFlexible`; Project still omits all of these.
3. `parseActions.ts` validates the new fields. `stabilizeActions.ts`: **do not** strip a window because the model isn’t asking for a clock. **Do** strip a guessed `preferredTime` that contradicts an open question.
4. `revisePlan.ts` prompt: moving “to the afternoon” sets `timeWindow` and clears a stale `06:00` if needed.
5. Do not put `NextResponse` or route concerns in the engine.
6. Cap: at most **one** time-preference question per action item.

### Windows (product constants, user-local timezone)

Use the user’s IANA zone. These are defaults for MVP (not ML):

| Window | Local start | Local end (exclusive of new starts) |
| --- | --- | --- |
| morning | 08:00 | 12:00 |
| afternoon | 12:00 | 17:00 |
| evening | 17:00 | 21:00 |
| anytime / flexible / “you pick” | 09:00 | 17:00 |

Night-as-evening if they said “night” without a clock. If they said “6–8am,” that is an explicit range, **not** the morning default (and not FB-13’s bug).

7. `proposeActionBlocks` (`src/lib/planning/blocks.ts`):
   - If `preferredTime` present → exact (P0 honor).
   - Else if `timeWindow` → place at **window start** on the named day (or scheduler-pick **within** window only when `timeFlexible` / anytime). MVP recommendation: **always place at window start** for a named day-part so the draft is deterministic and editable; do **not** search for earliest gap (that was the old trust bug). If window start conflicts, still place and set `conflictsWith`.
   - Else if `timeFlexible` → place at **09:00** (start of anytime window), same conflict policy — labeled in UI as picked by Sundae.
   - Else → same as flexible, but engine should have asked once.

8. `/propose` remains read-only. Confirm UI allows changing the start (existing edit path / revise).

### UX

9. Chat may say: “I’ll put that Thursday morning — showing as 8:00am on the draft, you can drag it.”
10. Do not tell users to paste screenshots of their calendar or to use voice.

## UX copy sketches

**Accepting a day-part:**

> Thursday morning — I’ll draft it at 8:00am. You can move it when we confirm.

**Accepting no preference:**

> No preference — I’ll draft it Thursday at 9:00am (open work window). Change it on the next screen if that’s wrong.

**The one question (only if nothing was said):**

> Any preference — morning, afternoon, evening, or whenever?

**Banned:**

> What time Thursday afternoon works best?  
> I need a clock time to continue.

## Success metrics

- In first-session transcripts: **zero** second+ clock questions after a day-part or “whenever.”
- Median extra turns per action for time capture drops (fixture: “Saturday afternoon, I don’t care what time”).
- Draft `start` for “afternoon” is inside 12:00–17:00 local on the named day (P0 tests).
- Confirm still used; no calendar writes from propose.

## Risks

- Deterministic window-start can conflict with a standing 8am event — `conflictsWith` + P0 policy; educate on confirm.
- Model may still emit both a guessed `14:00` and ask a question — keep stabilize rules.
- Schema change must round-trip `pending_proposed` / persist (`src/lib/weeklySession/persist.ts`) without dropping windows.
- If window-start is 8:00 and Brooklyn’s mental “morning” is 10:00, confirm edit is the outlet — copy must say the start is a draft.

## Dependencies

- P0 [honor-stated-schedule-on-proposal.md](honor-stated-schedule-on-proposal.md) — placement tests must use windows, not 6am dump.
- `src/lib/weeklySession/week.ts` timezone.
- Confirm/revise UI already lets users change times; may need to display “window: afternoon” on `WeeklyPlanPanel` chips.

## Open questions

1. Should “morning” for a parent who said “after school drop-off” still be 08:00 or require the one clarifying question? **Recommendation:** if they added a constraint in the same utterance, ask once; if they only said “morning,” don’t.
2. Evening window end 21:00 vs 22:00 — pick 21:00 for MVP.
3. Habits “every morning”: cadence 7 + each block at morning window start, still confirm-before-write.

## Suggested implementation surfaces

| Area | Where |
| --- | --- |
| Prompt + tool schema (change the day-part rule) | `src/lib/engine/weeklySession.ts` |
| Types | `src/lib/engine/weeklySessionTypes.ts` |
| Parse / lock fields | `src/lib/weeklySession/parseActions.ts`, `src/lib/engine/stabilizeActions.ts` |
| Revise | `src/lib/engine/revisePlan.ts` |
| Slotting | `src/lib/planning/blocks.ts`, tests |
| HTTP (call engine, don’t put rules here) | `src/app/api/weekly-session/step/route.ts`, `propose/route.ts` |
| Chips during chat | `src/components/WeeklyPlanPanel.tsx` |
| Confirm grid | `src/components/WeekCalendarGrid.tsx`, `src/app/(app)/weekly-session/page.tsx` |
