# PRD: Positioning — organize thoughts, then life areas

**Status:** Ready for copy/marketing  
**Priority:** P2  
**Phase:** MVP (copy). Not a new product.  
**Feedback:** FB-10  
**Tester:** Brooklyn, first weekly session  

## Problem

Launch copy currently **leads with Google Calendar** (“turns those roles into a real week on your Google Calendar”). Brooklyn’s pitch for Sundae is:

1. **Organize thoughts**
2. Into **short and longer(er) plans per life area** (roles / hats)
3. **Track and motivate** through the week
4. Calendar is **delivery** — how the plan lands — not the hero

People who need a thought-organizer bounce if they think this is “another AI that dumps stuff on my calendar.” People who only hear “calendar” don’t understand Stage 0 or the KPI loop.

This is **not** a yearly-goals product, not Apple Calendar, not ML coaching.

## Evidence

| ID | Report |
| --- | --- |
| FB-10 | Marketing should lead with organizing thoughts / life areas; calendar is downstream |

Point of truth for current strings: [`docs/launch-day-copy.md`](../launch-day-copy.md). Landing interpolates `MONTHLY_PRICE` in `src/app/page.tsx`. Offer stays **7-day trial, then $7.99/month**, cancel anytime — unless a **separate** billing decision lands ([first-session-time-and-trial.md](first-session-time-and-trial.md)).

## Goals

- Rewrite hero / LinkedIn / X / waitlist **story order**: thoughts → life areas → plans (this week + longer-than-a-task) → track/motivate → calendar confirm as proof of delivery.
- Keep confirm-before-write as a **trust** line, not the only line.
- Keep roles/hats vocabulary; “life areas” is user-facing synonym, not a schema change.
- Honest trial length (7 days) and first-session length pointer.

## Non-goals

- Annual OKRs, yearly roadmap product, multi-year vision boards.
- Dropping Google Calendar from the product or from the FAQ.
- SMS/voice in the pitch.
- Changing Stripe price.
- Implementing new ranking/ML.

## User stories

1. As a visitor, I understand Sundae helps me sort what matters in each part of life, then make a week I can follow — calendar is how it shows up.
2. As Brooklyn, the site matches what the session felt like (conversation first).
3. As legal/support, trial and price strings still match Checkout.

## Current behavior vs desired

### Current (`docs/launch-day-copy.md` + landing)

- LinkedIn: roles → “real week on your Google Calendar. One guided session. Nothing gets scheduled until you confirm.”
- X: “AI-guided weekly planning that lands on your real Google Calendar.”
- Waitlist: roles, plan the week, confirm onto Google Calendar, daily follow-up scorecard.
- Hero/FAQ: 7-day trial, $7.99/month.

### Desired

Same facts, **reordered and reweighted**. Calendar still mentioned in paragraph 2 or 3 and in FAQ. Daily follow-up = **email** + in-app log (don’t imply push).

Longer plans = **projects (sliders) + verbatim memory of roles** across weeks — not a yearly goal system. Say “beyond a single task” / “projects that don’t fit a Tuesday 3pm,” not “your year in review.”

## Requirements

1. Update `docs/launch-day-copy.md` as the source for social + waitlist; then landing `src/app/page.tsx` hero, closing CTA, FAQ to match.
2. Onboarding survey/hype lines (`src/app/onboarding/page.tsx`) should not contradict (demo can still show calendar drill-down — that’s the **delivery** demo).
3. Trust line retained: nothing written to Google until confirm.
4. No Apple Calendar, no “we text you,” no “gets smarter with ML.”
5. Optional FAQ: “Is this just a calendar app?” → No. Calendar is how the week is delivered.
6. Coordinate trial duration honesty with the trial PRD (range for first sitting).

## UX copy sketches

**Hero (web):**

> Sundae helps you organize what matters in each part of your life — then turn it into a week you can actually follow.  
> You confirm the plan before it lands on Google Calendar. Daily email nudges you to log and stay honest.  
> 7-day free trial, then $7.99/month. Cancel anytime.

**LinkedIn:**

> Sundae is live.  
>  
> It’s an AI weekly planner that starts in your head, not on a blank calendar: the hats you wear, what’s actually important, a short plan for this week and a place for the bigger messy stuff. Then — only after you confirm — it goes on Google Calendar.  
>  
> Track the week in the app. We’ll email you; we don’t spam your lock screen.  
>  
> Try it free for 7 days, cancel anytime. After that, $7.99/month.  
> https://sundaeplanner.com

**X:**

> Sundae: organize the week by the lives you actually lead. Confirm before anything hits Google Calendar.  
> 7-day trial, then $7.99/mo. sundaeplanner.com

**Waitlist / launch email:**

> Subject: Sundae is live — organize the week, then put it on the calendar  
>  
> Sundae helps you sort your thoughts by life area (the roles you already play), make a plan for this week, and keep a simple score of what you actually did. Google Calendar is how the plan shows up — nothing is written until you confirm.  
>  
> Try it free for 7 days, cancel anytime. After the trial it’s $7.99/month.

**FAQ — “Do you support Apple Calendar?”**

> Not yet. Google Calendar only.

**FAQ — “Will you text / push my phone?”**

> Not in this version. Reminders are email; you log in the app.

**Banned:**

> Set your yearly goals and let AI run your life.  
> We sync every calendar you own.  
> Personalized AI that learns you.

## Success metrics

- Copy review: calendar appears, but not in the first clause of the hero.
- No contradiction with 7-day Stripe trial unless billing is separately changed.
- Qualitative: Brooklyn-like users say the site sounded like the session.

## Risks

- Under-selling calendar may confuse people who **want** the GCal hook — keep it in sentence two and FAQ.
- “Longer plans” misread as annual — always pair with “projects / this season,” not “2026 OKRs.”

## Dependencies

- `docs/launch-day-copy.md` (explicit).
- [first-session-time-and-trial.md](first-session-time-and-trial.md) for duration/trial clauses.
- [post-plan-operating-loop.md](post-plan-operating-loop.md) for email-not-push.
- [explain-goal-types-and-kpi.md](explain-goal-types-and-kpi.md) for “score.”

## Open questions

1. Meta/OG image (`src/app/opengraph-image.tsx`) still calendar-forward? Update when design has a non-calendar visual — not blocking copy.
2. Agent demo (`src/components/AgentDemo.tsx`) narration order — align when copy ships.

## Suggested implementation surfaces

| Area | Where |
| --- | --- |
| Canonical social/email | `docs/launch-day-copy.md` |
| Landing | `src/app/page.tsx`, `opengraph-image.tsx` |
| Onboarding | `src/app/onboarding/page.tsx`, `docs/onboarding-flow.md` |
| Demo | `src/components/AgentDemo.tsx` |
| Legal still accurate | `src/app/terms/page.tsx`, `privacy/page.tsx` (only if they claim other calendars/push) |
