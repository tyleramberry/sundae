# PRD: Calendar context while planning

**Status:** Ready for engineering  
**Priority:** P2  
**Phase:** MVP (this week’s events + education). Month-ahead in chat is nice-to-have.  
**Feedback:** FB-12  
**Tester:** Brooklyn, first weekly session  

## Problem

Brooklyn wanted to **see** what was already on Google Calendar while planning, including a feel for the **month ahead**. She did not realize Sundae **already reads** the week to find gaps and injects a “This week’s real Google Calendar” briefing into the model prompt.

The gap is **visibility and education**, not OAuth. Rebuilding Google connect would not have shown her the events on the confirm UI.

## Evidence

| ID | Report |
| --- | --- |
| FB-12 | See existing GCal events more clearly while planning; month ahead |

Related: FB-13/15 — seeing events also explains conflicts (`conflictsWith`) if a draft overlaps. P0 placement bugs are a different PRD; this one must not reintroduce earliest-gap moving.

## Goals

- Show **this planning week’s existing events** on the confirm / draft surface (and/or a short human briefing in the chat sidebar).
- Educate once: “Sundae already used these busy times to place your draft. Nothing is written until you confirm.”
- Keep `/propose` read-only; keep `/confirm` as the only write.
- Do not rebuild OAuth (`src/lib/google/tokens.ts`).

## Non-goals

- Apple Calendar / Outlook.
- Month-grid product or a full calendar client.
- Auto-write or auto-accept invites.
- Prompting users to paste calendar screenshots (Phase 2 vision).
- Changing gap-finding to move her stated times (P0 forbids that).

## User stories

1. As Brooklyn, on the confirm screen I see **existing** events (gray) and **draft Sundae** blocks (distinct), so 6–8am existing “Wake up” is not confused with a new draft.
2. As Brooklyn, a one-line briefing exists: “Here’s what’s already on your calendar this week.”
3. As Brooklyn, I understand month-ahead is not required for a good week plan; nice-to-have later.
4. As Brooklyn, if Google isn’t connected, I see that — not an empty fake week.

## Current behavior vs desired

### Current

- `formatCalendarSummary` in `src/lib/weeklySession/calendarSummary.ts` injects busy ranges into `weeklySession.ts` context. Chat still felt blind because the **UI** doesn’t show it.
- `proposeActionBlocks` uses `busyRangesFromEvents`.
- Events API: `src/app/api/calendar/events/route.ts`, `src/lib/google/calendar.ts`.
- `WeekCalendarGrid.tsx` is draft-centric; existing events are not a first-class layer (conflict strings exist on proposed blocks).
- Month-ahead: not in summary (week window only via `planningWeekStartDate` / `planningWeekEndDate`).

### Desired

- **Must:** overlay or list this week’s Google events on the confirm grid / a panel beside it. Titles + times, read-only.
- **Must:** short copy that calendar is already used for conflicts/gaps; stated times still win (P0).
- **Should:** if the model is asked “am I free Thursday?”, it can answer from the same summary (already possible) — UI briefing reduces the need to ask.
- **Nice-to-have:** in-chat mention of the next 30 days only as a **compressed** count (“12 busy weekdays in the next month”) — not a month view, not a second OAuth scope if current scope already can read; if the API call is heavy, **defer**. Do not block MVP on month-ahead.

## Requirements

1. Fetch the same events propose uses (user timezone, planning window). Reuse `calendar/events` or the propose payload; don’t double-OAuth.
2. Confirm UI: existing vs proposed visually distinct. Existing is not editable in Sundae.
3. Empty week: “No existing events this week — the calendar looks open.”
4. Unavailable: use `CALENDAR_UNAVAILABLE_SUMMARY` meaning in the UI (“Reconnect Google Calendar”) — don’t guess.
5. Education snippet on confirm and once in Stage 3 chat (engine may be told it **may** say “I can see this week’s calendar” because that’s true). Do not claim month-ahead if not fetched.
6. `/propose` remains read-only. No writes without confirm.
7. Privacy: show event titles she already has on Google; don’t log titles to third parties beyond existing Google calls.

## UX copy sketches

**Panel header:**

> Already on Google this week (read-only). Draft blocks are yellow / labeled Draft — nothing writes until you confirm.

**Education:**

> Sundae uses these busy times when drafting. If a draft overlaps, we’ll flag it instead of secretly moving you to 6am.

**Disconnected:**

> Google Calendar isn’t connected, so I can’t show existing events. Reconnect to draft around real busy times.

**Nice-to-have month line:**

> Next 30 days: 8 weekend events, weekdays look like a normal work calendar. (Only if implemented.)

**Banned:**

> Paste a screenshot of your month.  
> We’ll put this on Apple Calendar.  
> We already wrote these events.

## Success metrics

- FB-12-style debrief: she **saw** existing events at confirm.
- Zero new OAuth implementation; reconnect path still `tokens.ts`.
- Propose still does not write.

## Risks

- Busy grid + many drafts = clutter on mobile. Desktop-first per spec; stack a list under the grid on small screens.
- Showing all-day events and overlapping existing 6–8am clusters — good, because it may explain FB-13 visually.
- Fetch failure shouldn’t block confirm of an already-proposed batch.

## Dependencies

- P0 honor-schedule (conflict flags + overlay).
- Scopes already requested at Google connect — don’t expand scopes unless read of month **requires** it; prefer same events.list with a wider timeMin/timeMax only for the nice-to-have.

## Open questions

1. Chat sidebar briefing during Stages 2–3 vs only at confirm? **Recommendation:** compact list available from confirm **and** a “This week on Google” disclosure during Planning so she isn’t surprised at the end.
2. Month-ahead: ship only if events.list for 30 days is cheap and copy stays a summary. Otherwise backlog.

## Suggested implementation surfaces

| Area | Where |
| --- | --- |
| Busy text for model (exists) | `src/lib/weeklySession/calendarSummary.ts`, `src/lib/engine/weeklySession.ts` |
| Events fetch | `src/lib/google/calendar.ts`, `src/app/api/calendar/events/route.ts`, `src/lib/google/tokens.ts` (no rebuild) |
| Slotting | `src/lib/planning/blocks.ts` (`busyRangesFromEvents`) |
| Propose (read-only) | `src/app/api/weekly-session/propose/route.ts` |
| Confirm write (unchanged policy) | `src/app/api/weekly-session/confirm/route.ts` |
| Grid / panel | `src/components/WeekCalendarGrid.tsx`, `WeeklyPlanPanel.tsx`, `WeekAssembly.tsx`, `src/app/(app)/weekly-session/page.tsx` |
| Week bounds | `src/lib/weeklySession/week.ts` |
