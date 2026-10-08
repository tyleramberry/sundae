# PRD: First-session time and trial

**Status:** Ready for engineering (copy now). Billing changes are a **product decision**, not this spec’s silent default.  
**Priority:** P1  
**Phase:** MVP  
**Feedback:** FB-06, FB-07  
**Tester:** Brooklyn, first weekly session  

## Problem

The first Sundae sitting is **Stage 0 (roles) + Accountability + Goal setting + Planning + propose/confirm**. That is longer than “one session a week” sounds, and longer than a **7-day Stripe trial** feels if someone believes the product “starts working” in week 2 (memory, faster sitting, last-week accountability).

Two separate issues:

1. **Honesty:** we did not say how long the first sitting takes, that Stage 0 is once, or that week 2 is faster.
2. **Billing anxiety:** 7 days may expire before the week-2 payoff is felt.

**Activation (do not redefine):** a user counts when they have started the **card-backed 7-day trial**, completed **onboarding**, and completed their **first** guided weekly session (`docs/MVP-spec.md`). Week 2 is **not** the success metric.

**Trial today:** Stripe native 7-day (`src/lib/trial.ts`, Checkout). This PRD **must not** be implemented as “just change Stripe to 14 days” without an explicit decision.

## Evidence

| ID | Report |
| --- | --- |
| FB-06 | Trial feels too short relative to a long first session + week-2 payoff |
| FB-07 | Setup and time commitment not explained |

Related: FB-01/02/11 — extra jogs/chips must be **capped** so we don’t make the sitting even longer. FB-16 — after-session loop is a different PRD.

## Goals

- Set a **true time expectation** before Stage 0: first sitting vs later weeks.
- Explain Stage 0 is **first session only**; later weeks start at Accountability.
- Explain week 2 payoff: Sundae **remembers roles/goals verbatim** and accountability has last week to talk about — not ML personalization.
- **Primary ship path:** copy + expectation **now**, keep 7-day Stripe trial.
- Document billing **options** for a later decision; do not encode 14-day or pause-trial as already chosen.

## Non-goals

- Silently changing `trial_period_days` in Stripe.
- Counting week 2 as activation.
- Adaptive ML “smarter sessions.”
- Push/SMS to “come back before trial ends” beyond existing `src/lib/email/trialReminder.ts`.
- Skipping Stage 0.

## User stories

1. As Brooklyn, before I start `/weekly-session` the first time, I see that the first sitting is the long one (roles + a full week plan) and later weeks are shorter.
2. As Brooklyn, I know the trial is **7 days from Checkout**, the first charge is after that unless I cancel, and finishing **this** session is the point of the trial — not “wait until next Sunday.”
3. As Brooklyn, I am not promised a 14-day trial in the UI if Stripe is still 7 days.

## Current behavior vs desired

### Current

- Onboarding: survey → demo → hype → `/subscribe` Stripe Checkout (`src/app/onboarding/page.tsx`). Copy: card not charged until 7 days after trial start; `docs/launch-day-copy.md` “Try it free for 7 days.”
- First `/weekly-session`: Stage 0 via `engine.ts` + `/api/engine/step`, then stages 1–3 via `weeklySession.ts`.
- `getTrialStatus` / `getSubscriptionStatus` in `src/lib/trial.ts`; reminder email day-before charge.
- No duration estimate on the weekly-session landing.

### Desired (primary path)

- Onboarding hype + weekly-session first-run header + subscribe page: **duration honesty** + **week 2 is nicer, not required to “get Sundae.”**
- Trial reminder email: don’t imply they failed if they haven’t done week 2; encourage completing **first** session if not done.
- Billing experiments listed below stay in “Open decisions.”

## Requirements

### Copy (ship this)

1. First-run weekly session (before Stage 0 chat): time range grounded in beta, not fantasy. Use a range, not a fake precise number.

   **Recommended:** “The first sitting is the long one — about **25–45 minutes** if you go straight through (roles you wear, then this week’s plan). Later weeks skip role setup and go faster. You can pause; the chat stays.”

   If internal timing data exists, replace the range; do not invent “8 minutes.”

2. State Stage 0 is once: “We only ask your roles in this first session.”
3. Week 2: “Next week we remember what you said and start with last week — that’s the payoff. You don’t need week 2 for Sundae to ‘count.’”
4. Trial: “7-day trial starts when you subscribe. Our goal together is to **finish this first plan** before it ends, not to wait for a second Sunday.”
5. Launch/marketing (`docs/launch-day-copy.md`, `src/app/page.tsx`) may add **one** clause: “First session is the long one; cancel anytime.” Do not lead with calendar-hero if positioning PRD lands — coordinate.
6. Never contradict Stripe: if trial is 7 days, UI says 7 days (`MONTHLY_PRICE` / trial strings).

### Billing options (decision record — pick later)

Do **not** implement as part of the copy-only primary path.

| Option | What | Pros | Cons vs activation metric |
| --- | --- | --- | --- |
| A. **Keep 7-day** (recommended default until decided) | Status quo + copy | Matches spec, Checkout, reminder math | Anxiety remains for slow users |
| B. **14-day trial** | Stripe `trial_period_days` 14; update `trial.ts`, reminder, launch copy, FAQ | More room for week 2 *feeling* | Still must not redefine success as week 2; two weeks of unpaid usage; copy/legal/FAQ sweep |
| C. **Pause / start trial at first session** | Trial clock starts when Stage 0+session starts or on confirm, not Checkout | Aligns paid window with product | **Not** native Stripe Checkout trial; custom `trial_end`; entitlement bugs; easier to game; larger engineering than copy |

**Primary recommendation:** **Option A + copy now.** Treat B vs C as an explicit founder/PM decision after measuring: first-session completion rate vs trial-end, time-to-first-confirm, cancel reasons. Do not ship B or C “while we’re in the files.”

7. If a decision later picks B or C, that is a **new** change to `src/lib/stripe/checkout.ts`, webhook, `trial.ts`, `docs/launch-day-copy.md`, and onboarding charge copy — out of scope until decided.

## UX copy sketches

**Weekly session first-run banner:**

> First session: we’ll capture the hats you wear, then plan this week. Budget **25–45 minutes**. After this, a normal week is shorter — we already know your roles.  
> Your 7-day trial is for getting **this** plan on the calendar, not for waiting until next week.

**Onboarding hype (add, don’t replace the demo):**

> You’ll do one longer guided sitting after you start the trial. That’s the whole setup.

**Subscribe:**

> 7-day free trial, then $7.99/month. Cancel anytime. Use the trial to finish your first weekly plan.

**Trial reminder (if first session not confirmed):**

> Tomorrow the trial ends. If you haven’t finished your first weekly plan, that’s the piece that makes Sundae real — week 2 can wait.

**Banned:**

> Try 14 days free. *(unless Option B is decided and Stripe is updated)*  
> The trial starts when you finish onboarding chat. *(unless Option C is decided)*  
> You’ll be billed in 7 days from account creation. *(onboarding already moved off `created_at` — keep Checkout-aligned)*

## Success metrics

- First-session **start → confirm** still the activation story; copy should not delay Checkout.
- Qualitative: Brooklyn-like users not surprised by duration or by week-2 being “when it remembers.”
- Optional analytics: `first_session_started`, `first_session_confirmed`, duration; `trial_ended_without_confirm`. Use these to decide B/C later.
- Do not optimize for week-2 completion as the north star.

## Risks

- 25–45 minutes may scare people off — better than rage-quit at minute 40. Pair with chips that **shorten** (Move on) in the jogs PRD, not more questions.
- Over-promising “later weeks are 10 minutes” if Accountability is still long — say “shorter,” not a fake number.
- Option C is easy to spec in a sentence and hard to get right with Stripe; keep it a decision.

## Dependencies

- [proactive-jogs-and-session-chips.md](proactive-jogs-and-session-chips.md) — cap extra questions.
- [post-plan-operating-loop.md](post-plan-operating-loop.md) — after confirm.
- [positioning-organize-life-areas.md](positioning-organize-life-areas.md) — marketing.
- Stripe: `src/lib/stripe/checkout.ts`, `src/app/api/stripe/checkout/route.ts`, `src/lib/email/trialReminder.ts`.

## Open questions

1. Exact p50 duration of first confirm — measure in analytics, then tighten the range.
2. Founders pick A/B/C; until then implement **A + copy**.
3. Should the demo in onboarding state the 25–45 minute range? **Yes, briefly.**

## Suggested implementation surfaces

| Area | Where |
| --- | --- |
| First-run banner | `src/app/(app)/weekly-session/page.tsx`, `RolesSetupScreen.tsx` |
| Onboarding | `src/app/onboarding/page.tsx`, `docs/onboarding-flow.md` |
| Subscribe | `src/app/subscribe/page.tsx`, `SubscribeCheckout.tsx` |
| Marketing | `src/app/page.tsx`, `docs/launch-day-copy.md` |
| Trial display | `src/lib/trial.ts`, dashboard trial line |
| Reminder | `src/lib/email/trialReminder.ts` |
| **Do not change unless decided** | Stripe trial days in `src/lib/stripe/checkout.ts`, webhook `src/lib/stripe/webhook.ts` |
