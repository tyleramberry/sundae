# Sundae — Onboarding Flow (Day 7 redesign)

Replaces the original Day 6/7 question-tree draft below this line's git
history (`git log -p` on this file for the old version, if it's ever
useful). The old flow was a single free-text chat conversation that
captured roles + per-role goals and ended on a flat "Your onboard."
confirmation. Two problems with that, found by actually using it:

1. **No hook.** Nothing about it built any excitement for what the app
   actually does — it was pure data entry before the product ever showed
   itself.
2. **It front-loaded the hardest conversation in the whole app.** Getting a
   real, SMART-quality goal out of someone (see
   [weekly-session-flow.md](weekly-session-flow.md)'s "SMART bar") is
   real work, and asking a brand-new user to do it before they've seen any
   payoff was backwards.

This version, studied against how Wispr Flow structures its own onboarding
(signup → permissions → setup → learn → personalize, opening on "which of
these resonate with you?" and proving the product hands-on rather than
telling you about it in a stats screen): **survey → live demo → hype →
straight into the user's first real weekly session.**

## What moved out of onboarding entirely

The functional roles + goals capture — the actual free-text conversation,
engine, and persistence that used to live here — did not get deleted. It
moved to the weekly session's new **Stage 0**, which only runs the first
time a user starts a session with no `onboarding_answers` row yet. See
[weekly-session-flow.md](weekly-session-flow.md#stage-0-roles--goals-first-session-only).
Reasoning: that conversation is real functional data the planning engine
depends on, but there's no product reason it has to happen *before* the
user has seen the product work. Letting it happen at the natural moment —
right as their first real session needs it — means onboarding itself can be
short, and the survey/demo/hype screens below never block on it.

## The flow, in order

Implemented in [src/app/onboarding/page.tsx](../src/app/onboarding/page.tsx).
**No skip on any screen** — same lesson pulled from studying Wispr's
onboarding: removing the option to bail early means nobody exits having
only half-seen the product.

### 1–3. Survey (context only, not functional data)

Three single/multi-select screens, chips only, no free text except an
"Other" catch-all on the first question:

1. **"How did you hear about Sundae?"** — single-select. Attribution.
2. **"What roles do you fill every week?"** — multi-select, ~16 presets
   (Founder, Parent, Manager, Athlete, etc.). **Survey/context only** — this
   is a different question from Stage 0's role capture and is never written
   to `onboarding_answers`. It exists to prime the user's own mental model
   before the demo, same purpose as Wispr's opening "which of these
   resonate?" screen, and to give personalization/marketing context.
3. **"What's Sundae going to solve for you?"** — multi-select (productivity,
   accountability, time-saving, motivation, planning my week, organization,
   time-saving during my planning session, etc.).

All three persist incrementally via `POST /api/onboarding/survey` — one
call per screen, not one call at the end — into the new `onboarding_survey`
table (`supabase/migrations/20260807000000_onboarding_survey.sql`),
deliberately separate from `onboarding_answers` so a user who answers the
survey but drops off before finishing the rest of onboarding still leaves
usable funnel data.

### 4. Live demo

One real text input — "What's on your mind this week?" — then a scripted,
deterministic animation (not a live model call) shows that exact text turn
into a concrete action item and land on a calendar block, ending on a
running counter. Deliberately **not** a live engine call: this is the most
important screen in onboarding, and a live model call risks latency or an
odd result on a first impression. It still reads as personal because the
derived action item is templated off what the user actually typed (see
`deriveActionItem` in the page), not a generic canned example.

### 5. Hype

Picks up exactly where the demo left off — the elapsed real time from typed
goal to calendar block is genuine (not a fabricated marketing stat),
extrapolated into a "this is what a full week of goals would save you"
line. Ends on the CTA straight into `/weekly-session`.

## Design notes carried over from the old flow

- **State is still just the transcript** for whatever conversational engine
  work remains (now living in Stage 0) — no hand-maintained stage machine.
  See [src/lib/engine/engine.ts](../src/lib/engine/engine.ts)'s file header
  for the failure mode this avoids.
- **Calendar reads stay automatic.** Neither the survey nor Stage 0 ever
  asks the user to describe their own calendar back to the app — Sundae
  reads Google Calendar directly.
