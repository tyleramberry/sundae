# Day 13 — Bug Bash (Thu 8/13)

Ran the full flow repeatedly against the seeded demo account
(`sundae.demo@example.com`, via `/api/debug/seed-test-account`) and the raw
`/debug/weekly-session` engine harness, deliberately feeding ambiguous
phrasing at every Planning-stage turn. Also exercised the KPI dashboard,
6-week trend view, in-app logging UI, and the Day 11 reconciliation cron
directly. Ranked below by how much each blocks the core loop (plan a week →
see it reflected correctly).

## High — blocks the core loop

### 1. The engine can misattribute an item to the wrong role
Confirmed twice, independently:

- **Live session:** mid-Planning, after answering the Parent goal-setting
  question, the already-confirmed Parent habit "Read together every night"
  flipped to **Athlete** in the Plan-so-far panel — visible in the raw
  `actionsSoFar` payload from `/api/weekly-session/step`, not just a
  rendering glitch. It self-corrected two turns later without user action.
- **Debug harness, cleaner repro:** during the Founder turn, said "meditate
  most mornings... that's more of a personal habit" (explicitly *not*
  founder-related). The engine never asked which role it belonged to — it
  silently filed it as `{"role":"Athlete","description":"Meditate most
  mornings","type":"habit","cadenceCount":5}`.

Root cause looks like `actionsSoFar` gets freshly re-derived from the whole
transcript each turn rather than incrementally accumulated, so an ambiguous
item's role can flip between turns. There's also no path for "this doesn't
belong to any of my roles" — the engine always forces a fit. If a user hits
Confirm during a turn where this is mis-set, wrong data lands in
`weekly_items` and silently corrupts both roles' KPI counts.

### 2. A stated "concrete piece" of an ongoing Project creates a duplicate item instead of updating the existing one
Happened twice, independently:
- Founder: already had an ongoing "Close the seed round" Project. When asked
  for a concrete piece of progress this week, "get the updated deck out to
  the two lead investors" was logged as a **brand-new separate Project**,
  disconnected from the existing one.
- Parent: same pattern — "Plan the weekend trip" (existing Project) vs.
  "price out the weekend trip" (created as a new standalone Goal).

This causes project/item sprawl and breaks trend continuity — the 6-week
trend for "Close the seed round" won't reflect the deck work, and vice
versa.

## Medium

### 3. Plan-so-far panel shows a guessed time before the user actually answers
After I said "Wednesday afternoon" (no specific time), the panel
immediately showed **2:00 PM** as a committed slot for "Follow up with two
investors" — while the chat was still actively asking "What time Wednesday
works best?" It corrected to 4:00 PM once I gave a real answer. Between
those turns the panel displayed a value the user never actually chose.

### 4. 6-week trend pads "no data" weeks before a role's actual first week
Spec (and the code's own comment in `src/app/api/dashboard/trend/route.ts`)
says a role active fewer than 6 weeks should show only the weeks that
exist. In practice, Athlete (seeded to have joined 3 weeks after Founder)
still shows all 6 weeks, with "no data" padded for the 3 weeks before it
existed. Cause: the earliest-week clamp is computed once per **user**
(earliest row across *any* role), not per role, so a later-joining role
inherits the account's overall start date instead of its own.

## Low

### 5. Dashboard's per-role item breakdown is hover-only, with no touch/keyboard fallback
The Day 16 dashboard redesign (`src/app/(app)/dashboard/page.tsx`) moved
each role's item list into a `pointer-events-none` popover that only
appears on `:hover` off a plain non-focusable `<span>`. There's no tap or
keyboard-focus equivalent, so on a touch device (a very likely primary
surface for a daily planning app) or via keyboard nav, a user can never see
what's inside a role's ring without leaving the page. (Logging itself
correctly lives on `/daily-follow-ups` and isn't affected — this is display
only.)

### 6. `/api/weekly-items/log` doesn't scope to the current week or validate type
The route updates any row by `id` + `user_id` with no check that the row
belongs to the current week, and no check that `done` is only sent for
habit/goal rows or `percent` only for project rows. Not reachable through
today's UI (the daily follow-ups page only ever links current-week ids),
but there's no server-side guard if that changes — could retroactively
alter historical trend data.

## Verified working (no action needed)

- KPI math — dashboard tile and 6-week trend both checked against known
  seed values across all three roles; numerator/denominator/percent
  calculations are correct, including the 0/0-role code path
  (`computeKpisForRoles` always maps every onboarding role).
- In-app logging UI — checkbox and slider on `/daily-follow-ups` both write
  through `/api/weekly-items/log` and the dashboard ring updates
  immediately and correctly.
- Session-start throttling — a second weekly session same-day is correctly
  blocked with a "come back tomorrow" message and a link back into the
  session already in progress.
- Reconciliation cron resilience — manually inserted a `weekly_items` row
  with a fake `google_event_id` for a user with no Google tokens on file;
  the cron correctly logged it to `failures[]` (clear message, no crash)
  and did **not** wrongly mark it removed. The rest of the batch (10 other
  candidate rows) processed normally.

## Coverage gap (not a bug — a testing limitation)

Could not verify the reconciliation cron's actual positive path (delete a
*real* confirmed Google Calendar event mid-week → cron sets `removed_at` on
the next run) end-to-end. The only account reachable without a real login
(the seeded demo account) has no Google OAuth tokens, and calendar write
requires Google sign-in, which needs a human in the loop. If we want that
path verified live rather than by code review, it needs one real
Google-account sign-in.

## Suggested Day 14 fix priority

1. Role-attribution stability in the weekly-session engine (#1)
2. Project/sub-task linkage instead of duplication (#2)
3. Trend view's per-role (not per-user) earliest-week clamp (#4)
4. Plan-so-far panel not showing unconfirmed guessed values (#3)
5. Dashboard hover-only breakdown — touch/keyboard fallback (#5)
6. `/api/weekly-items/log` week + type scoping, defense-in-depth (#6)
