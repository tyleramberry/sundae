# Sundae — MVP Spec v2

**One-liner:** An AI-guided weekly planning app where the user sets the vision (roles, priorities, goals) and the agent handles the busywork (scheduling, logging, follow-up) — never the other way around.

**Platform:** Web app, desktop-first, mobile-responsive nice-to-have.

**Tech stack:** Next.js (App Router) + Supabase (Postgres + Auth) + Vercel (hosting + Cron for scheduled jobs) + Google Calendar API via OAuth.

**Architecture note:** The planning engine (conversation logic — what question comes next, how answers get parsed, how calendar blocks get proposed) is built as a **channel-agnostic service**, separate from the web UI. It takes "user message + conversation state" in, returns "next question or action" out. This is what makes SMS and voice possible later without a rewrite.

**Calendar integration:** Google Calendar only. Read + write to the user's primary calendar.

**Notifications:** Email for MVP.

**Billing:** Stripe Checkout with a native 7-day trial period on the subscription. Card collected at signup; first charge fires automatically on day 7 unless canceled. Cancel anytime.

**Goal:** 50 paying free-trial users by September 1. A user counts toward this goal once they have: started the card-backed 7-day free trial (Stripe subscription created), completed onboarding, and completed their first guided weekly planning session. Revenue itself is not the point of this challenge — the trial-start + activation combination is.

## Core loop (in scope)

1. **Onboarding** — user defines their roles (founder, husband, athlete, etc.)
2. **Guided weekly session** — follows up on last week's goals, asks 2-3 questions per role, surfaces this week's big three, proposes calendar blocks
3. **Calendar write** — only after user confirms/edits
4. **Daily brief (email)** — yesterday's completed/incomplete + today's big three
5. **Daily follow-up nudge (email)** — yes/no check-in, feeds next week's session

## Out of scope for MVP

- Apple Calendar / Outlook integration
- Auto-accepting or auto-sending calendar invites without user confirmation
- Adaptive "gets smarter every week" ML personalization — MVP just remembers stated roles + last week's goals verbatim
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
