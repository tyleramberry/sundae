# Brooklyn — first weekly session (structured beta)

**Tester:** Brooklyn
**Session:** first guided weekly planning session (Stage 0 roles + Accountability / Goal setting / Planning, then propose → confirm)
**Source:** live session + debrief. Screenshots of the draft calendar were promised for FB-13 / FB-15 and were **not attached** (see FB-18).
**Date captured:** 2026-09 (beta)

## Executive summary

The conversation engine is the product’s strength. Brooklyn stayed with the chat, and **park-and-return stay-on-task** worked: when she jumped ahead or named something out of order, the agent parked it and came back without losing the thread. That behavior is a **KEEP**.

Frustration concentrated on **calendar placement** (wrong clock, wrong weekdays) and **education** (what happens after confirm, how scoring works, how long the first sitting takes, that reminders are email). Trust in the planner is load-bearing; a draft that ignores “afternoon” or “Wednesday” is a trust-breaker even though confirm-before-write still lets her edit.

Activation for Sundae remains **trial + onboarding + first weekly session**, not week 2. Week 2 is a speed/memory payoff, not the success metric.

## What to keep

- Channel-agnostic Claude engine (`src/lib/engine/weeklySession.ts`, `src/lib/engine/engine.ts`) — not regex.
- Park-and-return stay-on-task during the sitting.
- Confirm-before-write: `/api/weekly-session/propose` is read-only; `/api/weekly-session/confirm` writes Google Calendar + `weekly_items`.
- Google Calendar only. Email notifications only. No Apple Calendar, SMS, push, or native app in MVP.

## Inventory

IDs are stable. Priority is product priority (P0 = ship-blocker / trust). Related PRDs live under `docs/prd/`.

| ID | Theme | Priority | Phase | PRD |
| --- | --- | --- | --- | --- |
| FB-01 | Role discovery — jog more roles unprompted | P2 | MVP (bounded) | [proactive-jogs-and-session-chips](../prd/proactive-jogs-and-session-chips.md) |
| FB-02 | Priority completeness — deeper questions after priorities | P2 | MVP (bounded) | same |
| FB-03 | Name greeting — “Hey Brooklyn” | P3 | MVP | same |
| FB-04 | Screenshot intake of existing plans | P3 | **Phase 2** | [phase-2-voice-and-screenshot-intake](../prd/phase-2-voice-and-screenshot-intake.md) |
| FB-05 | Voice as a channel | P3 | **Phase 2** | same |
| FB-06 | Trial shorter than first-session + week-2 payoff | P1 | MVP (copy now; billing = decision) | [first-session-time-and-trial](../prd/first-session-time-and-trial.md) |
| FB-07 | Setup & time commitment not oriented | P1 | MVP | same + [post-plan-operating-loop](../prd/post-plan-operating-loop.md) |
| FB-08 | “Morning sometime” / “I don’t care” — stop asking for a clock | P1 | MVP | [day-part-and-flexible-time](../prd/day-part-and-flexible-time.md) |
| FB-09 | Goals vs habits (and projects) unexplained | P2 | MVP | [explain-goal-types-and-kpi](../prd/explain-goal-types-and-kpi.md) |
| FB-10 | Marketing: organize thoughts / life areas, not calendar-hero | P2 | MVP (copy) | [positioning-organize-life-areas](../prd/positioning-organize-life-areas.md) |
| FB-11 | “Move on” / “Add something” chips | P2 | MVP | [proactive-jogs-and-session-chips](../prd/proactive-jogs-and-session-chips.md) |
| FB-12 | See existing Google Calendar events more clearly | P2 | MVP | [calendar-context-while-planning](../prd/calendar-context-while-planning.md) |
| FB-13 | Asked afternoon; draft landed 6–8am | P0 | MVP bug | [honor-stated-schedule-on-proposal](../prd/honor-stated-schedule-on-proposal.md) |
| FB-15 | Wrong weekdays (Wed→Tue, Sat→Mon) + extra Tuesday | P0 | MVP bug | same |
| FB-16 | Expected phone notifications; daily check-in unexplained | P2 | MVP (educate; no push) | [post-plan-operating-loop](../prd/post-plan-operating-loop.md) |
| FB-17 | Weekly score read as a sleep-style score | P2 | MVP | [explain-goal-types-and-kpi](../prd/explain-goal-types-and-kpi.md) |
| FB-18 | Screenshots mentioned in debrief but missing | P3 | Evidence gap now; vision **Phase 2** | [honor-stated-schedule-on-proposal](../prd/honor-stated-schedule-on-proposal.md) (repro) + [phase-2-voice-and-screenshot-intake](../prd/phase-2-voice-and-screenshot-intake.md) |

There is no FB-14 in this inventory.

---

### FB-01 — Role discovery jogs (P2)

**What she said:** The agent should jog more roles without waiting for her to invent the list. People forget hats they actually wear.

**Sample probes she liked (seed, not a script to dump all at once):**

- Do you have kids, or people you care for?
- Are you in school, studying, or training for something?
- Is there a faith / community / volunteer hat?
- A sport, gym, or body-care role you would actually protect this week?
- A home / household ops hat (bills, house, admin)?
- A relationship hat besides “partner” if that’s already listed (friends, family of origin)?

**Current behavior:** Stage 0 (`src/lib/engine/engine.ts`) asks what roles/hats she wears, reads the list back, then per-role big-picture goals. It does **not** systematically probe missing life areas. Stay-on-task later in the weekly session is strong; discovery is comparatively passive.

**Implication:** Bounded, optional probes — not a longer interrogation. Cap extra questions. Preserve park-and-return.

---

### FB-02 — Priority completeness (P2)

**What she said:** After she names priorities for a role, she wants a bit more depth — “is that everything that would actually matter this week?” — so the week isn’t built on the first sentence.

**Current behavior:** Stage 0 accepts whatever she gives for the 2–3 things that matter and moves to the next role (by design, to avoid interrogation). Stages 2–3 already drill toward SMART actions. The gap is a **light completeness check**, not a second SMART gauntlet.

**Implication:** One bounded follow-up per role or at list-confirm, plus chips (FB-11). Do not let this extend first-session time without a cap (see FB-06 / FB-07).

---

### FB-03 — First-name greeting (P3)

**What she said:** Open with “Hey Brooklyn,” not a generic agent voice.

**Current behavior:** Session copy is generic (“Hey, welcome back…” in recap-adjacent copy). Google / Supabase profile first name is not used in the weekly-session greeting.

**Implication:** Cheap if a first name exists; skip rather than guess. Do not block P0 calendar work on this.

---

### FB-04 — Screenshot intake (P3, Phase 2)

**What she said:** She already has plans in other tools / photos of lists. Being able to drop a screenshot and have Sundae ingest it would skip a lot of typing.

**Current behavior:** Text chat only. No vision pipeline. Product must **not** prompt users to paste screenshots until this exists.

**Implication:** Out of MVP. Engine stays channel-agnostic so a later vision pre-processor can emit text/state into the same `processMessage` contract. See Phase 2 PRD.

---

### FB-05 — Voice (P3, Phase 2)

**What she said:** Talking the session would be easier than typing, especially for a long first sitting.

**Current behavior:** Web text UI is the only caller. Engine is already channel-agnostic (no `NextResponse` in the engine). Voice / SMS / push / native app are Phase 2 per `docs/MVP-spec.md`.

**Implication:** Do not prompt users to use voice until a channel exists. Do not rewrite the engine around the web request.

---

### FB-06 — Trial length vs first-session reality (P1)

**What she said:** A 7-day Stripe trial feels tight if the first weekly session is long and the *feel* of the product (memory, faster sitting, accountability on last week) shows up in week 2.

**Product fact:** Success metric is **card-backed trial + onboarding + first weekly session**, not week 2. Trial is Stripe 7-day (`src/lib/trial.ts`). Do not silently change billing in implementation without an explicit decision.

**Implication:** Honest time copy now. Treat 14-day trial or “pause trial until first session” as **options to decide**, not as the spec.

---

### FB-07 — Setup and time commitment (P1)

**What she said:** She wasn’t oriented to how long the first sitting takes, that Stage 0 is first-session only, or what she owes the product after confirm (daily logging). Setup felt larger than “one session a week” marketing.

**Current behavior:** Onboarding is survey → demo → hype → Stripe (`docs/onboarding-flow.md`). Roles/goals conversation is Stage 0 on `/weekly-session`. Daily loop is email brief + email follow-up + in-app `/daily-follow-ups`. Time-on-session is not promised up front.

**Implication:** Set expectations before and after the sitting. Pair with FB-16 (what “check-in” means) and FB-06 (trial honesty).

---

### FB-08 — Day-parts and flexible time (P1)

**What she said:** “Morning sometime” and “I don’t care / whenever” should be enough. The agent kept asking for a clock time.

**Current behavior:** `src/lib/engine/weeklySession.ts` **requires a real clock time** for Habit/Goal. Day-parts are explicitly **not** a time. The only omit-`preferredTime` path is after she is asked and says the equivalent of “whenever, you pick.”

**Implication:** This feedback **contradicts the current engine rule**. The engine rule should change: map day-parts and “I don’t care” to a window; still emit slottable blocks; confirm screen stays editable. Do not interrogate for `HH:MM` when a window is enough.

---

### FB-09 — Goals vs habits unexplained (P2)

**What she said:** She never picked a type, then saw Habit / Goal / Project language (or calendar vs slider behavior) without a plain-language explanation.

**Product fact:** The engine classifies; the user is never asked to pick a type (`docs/MVP-spec.md`). Habit = many blocks, Goal = one block, Project = 0–100% slider.

**Implication:** Explain in user language at classification time and/or on confirm / dashboard. Do not add a type-picker form.

---

### FB-10 — Marketing: organize thoughts, then life areas (P2)

**What she said:** Lead with organizing thoughts into short and longer plans per life area (roles), then track and motivate. Calendar is how the week gets delivered, not the hero of the pitch.

**Current behavior:** Launch copy (`docs/launch-day-copy.md`) leads on roles → Google Calendar → confirm-before-write.

**Implication:** Copy/positioning change. Do not invent a yearly-goals product. Do not drop calendar from the product — demote it in the story.

---

### FB-11 — Move on / Add something chips (P2)

**What she said:** Visible chips to **move on** (this role / this list is enough) or **add something** (another role, another priority) would beat typing “that’s it” / inventing more.

**Implication:** UI affordances on Stage 0 and light completeness moments. Must not fight stay-on-task (chips send a normal user message into the same engine). Cap so sessions don’t get longer (FB-01/02).

---

### FB-12 — See existing Google Calendar events (P2)

**What she said:** She wanted to *see* what was already on Google Calendar while planning — including a sense of the month ahead — not only talk in the abstract.

**Current behavior:** Busy times **are** injected into the weekly-session prompt as “This week’s real Google Calendar” (`src/lib/weeklySession/calendarSummary.ts`). `/propose` slots against real busy ranges. The UI does not make that obvious; month-ahead is not in chat.

**Implication:** Don’t rebuild OAuth. Surface events in confirm UI and/or a short briefing. Educate that gaps are already used. Month-ahead in chat is nice-to-have.

---

### FB-13 — Afternoon asked, draft 6–8am (P0, bug)

**What she said:** She planned something for the **afternoon**. The draft calendar put it **6–8am**. Trust-breaker.

**Evidence:** Verbal report only. Screenshots were promised and not attached (FB-18).

**Hypotheses to investigate in implementation (not mutually exclusive):**

1. **Timezone:** server UTC vs user zone; `preferredTime` parsed as UTC; week window computed in the process zone (`src/lib/weeklySession/week.ts` already documents this class of bug).
2. **Weekday off-by-one** interacting with “today vs next week” so the block lands on a morning that is “free” in the wrong interpretation of the week.
3. **Earliest-gap fallback:** historical `proposeActionBlocks` used to cascade to any free slot (documented as rewritten to exact day+time + `conflictsWith`). Confirm whether any remaining path still dumps to early morning (fallback minutes, omitted `preferredTime`, or a stale client).
4. **Habit cadence dump:** a multi-block habit filling `DEFAULT_DAY_ORDER` / default clock when afternoon wasn’t stored on `preferredTime`.
5. **Engine asked for a clock, never got one, then proposed anyway** with a default (today default fallback in `blocks.ts` is 9:00, not 6:00 — so 6–8am may be copying an existing morning cluster or a mis-captured window, not the 9am constant).

**Implication:** Placement must honor stated day-part or clock. Confirm-before-write is not an excuse to show a lying draft.

---

### FB-15 — Wrong weekdays + extra Tuesday (P0, bug)

**What she said:** **Wednesday** landed on **Tuesday**. **Saturday** landed on **Monday**. An **extra Tuesday** block appeared that she did not ask for.

**Evidence:** Verbal report. No screenshots (FB-18).

**Hypotheses:**

1. **Weekday encoding:** engine `weekday` is 0=Sunday…6=Saturday (`weeklySessionTypes` / `parseActions`). Luxon is 1=Monday…7=Sunday (`zonedWeekday` uses `% 7`). Any leftover ISO-as-JS or 1-based Sunday index would shift days.
2. **Off-by-one vs `planningWeekStartDate`:** day offset from Sunday window start vs named weekday.
3. **Saturday → Monday:** if Saturday is treated as past / outside the planning window (Friday/Saturday roll-forward to next week in `week.ts`, or “already past” in `placeAt`), a multi-block habit **falls through `DEFAULT_DAY_ORDER`**, which is Monday-first `[1, 2, 3, 4, 5, 0, 6]`. That can place leftover cadence on Monday.
4. **Extra Tuesday:** `cadenceCount` too high (engine classified “habit, N×” from language like “this week” / “a few times”) then dumped extra occurrences onto the next free days in `dayOrder`.
5. Same timezone issues as FB-13.

**Implication:** Named weekday must stick for single-block asks. Extra blocks need a visible cadence the user can edit. Do not silently move Saturday → Monday.

---

### FB-16 — Phone notifications / daily check-in education (P2)

**What she said:** She expected **phone** notifications to remind her to check in. She did not understand that the operating loop after confirm is **in-app logging**, nudged by **email**.

**Product fact:** MVP notifications are **email** (daily brief + follow-up). Logging is in-app (`/daily-follow-ups`). **No push.** Native app is Phase 2.

**Implication:** Educate immediately after confirm. Do not promise push. Do not add SMS.

---

### FB-17 — Weekly score vs sleep score (P2)

**What she said:** The weekly number read like a sleep-app score (mysterious 0–100 quality), not “how much of what I planned did I do.”

**Product fact:** KPI math lives only in `src/lib/kpi/compute.ts`. Role KPI is a **fraction**; `percent: null` when nothing planned is **not** 0%. Master score averages roles that have data; empty-all-roles currently returns `0` from `computeMasterScore` — copy must not present that as a failing grade.

**Implication:** Show fraction + short definition. Empty week = no data, not 0%.

---

### FB-18 — Screenshots mentioned but missing (P3)

**What she said / what happened:** Debrief referenced calendar screenshots to prove FB-13 and FB-15. They were never attached.

**Implication for now:** Treat calendar bugs as **high-confidence verbal repro**; instrument the next session (proposed JSON, timezone, `weekday`, `preferredTime`, `cadenceCount`) so engineering is not blocked on photos. Do **not** ask production users to paste screenshots as a product feature until Phase 2 vision exists (FB-04).

---

## Mapping to product facts (do not “fix” these in feedback)

- Trial: Stripe 7-day. Activation = trial + onboarding + **first** weekly session.
- Propose read-only; confirm writes.
- Engine: Claude, channel-agnostic.
- Goal types: user never picks; Habit / Goal / Project as spec.
- Stage 0 first session only, then Accountability → Goal setting → Planning.
- Phase 2: voice, SMS, push, native app, Apple Calendar, auto-write without confirm, ML personalization, screenshot vision.
