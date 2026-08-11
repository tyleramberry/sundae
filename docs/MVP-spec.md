# Sundae — MVP Spec v2

**One-liner:** An AI-guided weekly planning app where the user sets the vision (roles, priorities, goals) and the agent transforms that into plans and handles the busy work (scheduling, logging, follow-up) — never the other way around.

**Platform:** Web app, desktop-first, mobile-responsive nice-to-have.

**Tech stack:** Next.js (App Router) + Supabase (Postgres + Auth) + Vercel (hosting + Cron for scheduled jobs) + Google Calendar API via OAuth.

**Architecture note:** The planning engine (conversation logic — what question comes next, how answers get parsed, how calendar blocks get proposed, how a stated goal gets classified as a habit vs. a project) is built as a **channel-agnostic service**, separate from the web UI. It takes "user message + conversation state" in, returns "next question or action" out. This is what makes SMS and voice possible later without a rewrite.

**Calendar integration:** Google Calendar only. Read + write to the user's primary calendar.

**Notifications:** Email for MVP.

**Billing:** Stripe Checkout with a native 7-day trial period on the subscription. Card collected at signup; first charge fires automatically on day 7 unless canceled. Cancel anytime.

**Goal:** 50 paying free-trial users by September 1. A user counts toward this goal once they have: started the card-backed 7-day free trial (Stripe subscription created), completed onboarding, and completed their first guided weekly planning session. Revenue itself is not the point of this challenge — the trial-start + activation combination is.

## Core loop (in scope)

1. **Onboarding** — a short survey (attribution + motivation, context only)
   plus a live scripted demo of the goal → action → calendar drill-down,
   ending on a hype screen and a handoff straight into the user's first
   weekly session. Captures no functional data of its own — see
   [docs/onboarding-flow.md](../docs/onboarding-flow.md).
2. **Guided weekly session** — a zeroth stage the first time only (defines
   the user's roles — founder, husband, athlete, etc. — and per-role goals,
   exactly what onboarding used to capture directly), then three stages run
   every sitting:
   - **Accountability** (once, at the top of the session): follow up on last week's goals, follow up on last week's KPIs, decide what rolls into this week, capture 3 wins and 3 things to improve
   - **Goal setting** (once per role, in the order the user listed them): "What's the most important thing you can do this week as {role}?"
   - **Planning** (once per role, looping over each distinct action inside that role's answer — a compound goal like "work out every day and stretch every night" gets two drill-downs, not one): classify each action as a Habit, a Goal, or a Project, then propose calendar block(s) (Habit/Goal) or start a slider (Project) — see Goal types & KPI logic below
3. **Calendar write** — only after user confirms/edits
4. **Daily brief (email)** — yesterday's completed/incomplete + today's big three
5. **Daily follow-up nudge (email)** — a prompt to open the app and log progress (no reply-based yes/no); feeds next week's accountability stage and updates each role's KPI
6. **KPI dashboard** — one pooled indicator per role, combining every habit block, goal, and project under that role this week (see Goal types & KPI logic below); every role shows a KPI even at 0/0, resets each week, logged in-app; click into a role's KPI for its 6-week completion-rate trend; reviewed in next week's accountability stage

## Goal types & KPI logic

Every action that comes out of the Planning stage is one of three types. The engine classifies which, based on the nature of the stated action — the user is never asked to pick a type directly.

- **Habit** — a countable, recurring action ("work out every morning", "stretch every night"). Planning parses the cadence language straight into that many calendar blocks (every morning → 7, every night → 7) — there is no separate "how many times?" question. Each confirmed block adds 1 to that role's denominator; marking a block done in-app adds 1 to the numerator.
- **Goal** — a single, one-off task that happens once ("renew my passport", "send the investor update"). Gets exactly one calendar block. Adds 1 to the denominator; marking it done adds 1 to the numerator. The only difference from a Habit is cardinality — one block instead of many.
- **Project** — a one-off, not-cleanly-countable goal ("close the seed round", "plan the anniversary trip"). Instead of a calendar block, a project gets an in-app 0–100% slider. Always adds exactly 1 to its role's denominator. Adds 1 to the numerator only once the slider reaches 100 — no partial credit in the KPI fraction itself, even though the slider shows granular progress in the UI while it's in progress.

**Compound goals stay pooled, not split.** A role's answer can contain more than one distinct action (the workout + stretch example above) — each gets its own Planning drill-down, but there's no per-action KPI. Everything under a role — habits, goals, and projects alike — rolls into that one role's single KPI fraction:

```
role KPI = (habit blocks done + goals done + projects at 100%) / (total habit blocks + total goals + total projects)
```

Example — Athlete, with "work out every morning" (Habit, 7 blocks), "stretch every night" (Habit, 7 blocks), and a one-off "book a physical therapy session" (Goal, 1 block): denominator 15, numerator ticks up 1 at a time as items get logged done in-app.

**Every role shows a KPI, even at 0/0.** A role with nothing planned for the week still appears on the dashboard, showing 0/0, rather than disappearing. Each week starts a fresh count — nothing unfinished carries into next week's denominator; a rolled-over goal is simply a new item under the new week (see Accountability, above).

**Clicking into a KPI shows a 6-week trend.** Each role's dashboard tile is clickable, opening a view of that role's completion **percentage** — not raw count, since how many habits/goals/projects a role has changes week to week — for each of the last 6 weeks (or fewer, for a user who hasn't been active that long). A week with nothing planned (0/0) shows as no data on the trend, not 0%, since an empty week isn't a bad week. The current, still-in-progress week is included and updates live as the user logs. This means a week's underlying records are never deleted or overwritten once the week ends — the live dashboard and the trend view read from the same per-week records, just grouped differently (current week only vs. last 6 grouped by week).

**Deleting a calendar block adjusts the KPI; rescheduling doesn't.**
- Rescheduling a Habit or Goal block (time/day changes, block itself stays) has no effect on the KPI — it's still the same commitment, just moved. No special handling needed for this in MVP.
- Deleting a Habit or Goal block **before** it's marked done removes it from that role's denominator — it never happened. This is done via a lightweight daily reconciliation (compare the block IDs stored at confirm-time against what's still on the calendar, once a day, piggybacking on the cron job Day 11 already builds for the daily email) rather than real-time Google Calendar push notifications, which would need new webhook infrastructure this app doesn't have yet.
- Deleting a block **after** it's already marked done has no effect — the credit stands. Cleaning up your calendar after the fact shouldn't cost you progress you already logged.

**Logging is in-app only.** The daily follow-up nudge email is a reminder to log progress, not a data-entry channel — checking off a habit or goal block and moving a project slider all happen inside the app, not via email reply.

## Out of scope for MVP

- Apple Calendar / Outlook integration
- Auto-accepting or auto-sending calendar invites without user confirmation
- Adaptive "gets smarter every week" ML personalization — MVP remembers stated roles + goals verbatim, and keeps 6 weeks of KPI history for the trend view, but nothing in that history feeds back into how future sessions are run
- Native mobile app
- Team/multi-user features
- **SMS as an interface** — texting the agent to run a planning session. Blocked on A2P 10DLC/toll-free registration lead time (days to weeks) plus per-user conversation-state handling over a stateless channel.
- **Voice notes over SMS** — record a voice memo back to the agent instead of typing. Requires the SMS interface above, plus a transcription pipeline (Whisper/Deepgram) and async reply handling since transcription isn't instant.
- **Live conversational voice agent** (type or talk, agent talks back — e.g. GPT-4o Realtime-style). Requires streaming audio both directions, turn-taking/interruption handling, and real-time low-latency routing — a meaningfully larger lift than text. A simpler push-to-talk version (record a memo → Whisper transcription → existing text engine → optional TTS reply) is a faster middle-ground worth considering sooner, but still not MVP.

## Permissions model

Read calendar → propose blocks → user confirms → write. Agent never writes without a confirm step.

## Success criteria

A "user" (for the 50-user goal) = someone who has started a card-backed free trial, completed onboarding, and completed their first guided weekly planning session. Responding to a daily follow-up nudge remains a secondary activation metric worth tracking, but is not required to count toward the 50.

## Phase 2 roadmap (post-30-day-challenge)

- SMS as an interface (text the agent to run a planning session) — start Twilio A2P registration early since approval takes days to weeks
- Voice notes over SMS (transcription pipeline)
- Live conversational voice agent — type or talk, agent talks back (push-to-talk version first, true real-time voice as a further step after that)
- Apple Calendar / Outlook integration
- Adaptive personalization — planning sessions that actually get sharper over time based on historical patterns, not just verbatim memory of last week
- Native mobile app (Expo/React Native, or Capacitor as a lighter-weight option)
- Auto-accept/auto-send calendar invites on the user's behalf, once trust is established with the confirm-first model
