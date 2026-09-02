# PRD: Phase 2 — voice and screenshot intake

**Status:** Explicitly **out of MVP**. Do not schedule into the 30-day challenge.  
**Priority:** P3 / Phase 2  
**Phase:** **Phase 2** (post-MVP)  
**Feedback:** FB-05, FB-04, FB-18  
**Tester:** Brooklyn, first weekly session  

## Problem

Brooklyn asked to **talk** through the sitting (the first session is long) and to **drop screenshots** of lists/plans she already has. Debrief also **mentioned screenshots of the draft calendar** for FB-13/FB-15 that were **never attached** (FB-18) — that is an evidence gap for bugs, not a reason to ship vision in MVP.

MVP is a **web text** app. Notifications are **email**. Native app, SMS, push, and live voice are **out of scope** (`docs/MVP-spec.md`). The planning engine is already **channel-agnostic** (`processMessage`: message + state in, reply + state out) so later channels should **not** require rewriting `weeklySession.ts` around `NextResponse`.

Until voice and vision **exist**, production copy must **not** tell users to use them.

## Evidence

| ID | Report | Phase |
| --- | --- | --- |
| FB-05 | Voice would be easier than typing | Phase 2 |
| FB-04 | Screenshot / photo of existing plans as intake | Phase 2 |
| FB-18 | Screenshots promised for calendar bugs, missing | Evidence process now; vision product later |

KEEP: stay-on-task, confirm-before-write, Claude engine, Google Calendar only.

## Goals (Phase 2 only)

- **Voice:** add a channel that turns audio into the same user `message` string the engine already accepts (push-to-talk + transcription first; live conversational voice later per spec).
- **Screenshot intake:** a vision step that extracts text/structured intents, then **enters the same engine** as if the user typed them — still confirm-before-write for any calendar result.
- Preserve channel-agnostic engines: `src/lib/engine/engine.ts`, `src/lib/engine/weeklySession.ts`.
- For FB-18 **now** (MVP ops, not this feature): instrument propose logs so calendar bugs don’t depend on photos ([honor-stated-schedule-on-proposal.md](honor-stated-schedule-on-proposal.md)).

## Non-goals (MVP — do not implement)

- Microphone UI, Whisper/Deepgram, Realtime voice, TTS.
- Prompting “paste a screenshot here” or “just talk to Sundae” in onboarding, chat placeholder, or launch copy.
- SMS / A2P / iMessage.
- Push notifications.
- Native app (Expo/Capacitor).
- Apple Calendar.
- Auto-write calendar from a photo without confirm.
- ML personalization.
- Using vision to “fix” FB-13 by asking beta users to upload calendar pictures as a product path.

## User stories (Phase 2)

1. As Brooklyn, I can hold a button, speak my roles, and see the same Stage 0 transcript as typing.
2. As Brooklyn, I can upload a photo of a paper weekly list; Sundae proposes interpreted actions **in the chat** for me to accept, then the normal propose/confirm calendar path.
3. As Brooklyn, if I never use voice or photos, the text path is unchanged.

## Current behavior vs desired

### Current (MVP — keep)

- Text UI is the only caller.
- Engine forbids assuming other channels.
- No vision. Chat placeholders should stay “type…” not “drop an image.”
- Calendar screenshots for QA are a **human** Slack/email to engineering, not an in-app feature.

### Desired (Phase 2)

- **Voice v1:** browser push-to-talk → transcript → existing `/api/weekly-session/step` and `/api/engine/step`. Optional TTS of `reply`. Still not SMS.
- **Voice v2:** live duplex agent (spec’s larger lift).
- **Vision v1:** image → model extracts candidate roles/actions as **draft user-visible text** she confirms in chat **before** those actions are locked. Then existing classification + `/propose` + `/confirm`.
- Never write Google Calendar from an image parse directly.

## Requirements

### MVP (this PRD’s binding rules for the current product)

1. Do **not** add voice or screenshot UI.
2. Do **not** add copy that invites screenshots or voice (“Send a pic of your planner,” “Try talking”).
3. Debug/dev routes stay behind `src/lib/devOnly.ts`.
4. FB-18: QA asks internally for propose JSON + timezone, not for a vision pipeline.

### Phase 2 — voice

5. New channel adapter (e.g. `src/lib/channels/voice.ts` — name illustrative) converts audio → `{ message: string }`. Engines stay pure.
6. Spec order: push-to-talk + transcription **before** GPT-Realtime-style live voice.
7. SMS remains a separate Phase 2 item (A2P lead time); don’t couple voice notes over SMS to v1 web push-to-talk.
8. Still no calendar write without confirm.

### Phase 2 — screenshots

9. Vision runs **outside** the planning prompt as a preprocessor: image → proposed text / structured candidates → user confirms in the transcript.
10. Do not store calendar PII from photos longer than needed; don’t train personalization models (spec: no adaptive ML in MVP; Phase 2 personalization is a **different** roadmap item).
11. If extraction is calendars (FB-13 style screenshots), treat as **support/debug**, not as a way around Google OAuth — OAuth remains the calendar source of truth.

## UX copy sketches

**MVP chat placeholder (keep / ensure):**

> Type your reply…

**MVP: if someone types “can I send a screenshot?”**

> Not yet — paste or type the list and I’ll work from that. Photos of plans are on the way.

**Phase 2 voice:**

> Hold to talk. We’ll transcribe, then plan the same way as typing. Nothing hits Google until you confirm.

**Phase 2 screenshot:**

> Upload a photo of a list. You’ll see what we read before it becomes this week’s plan.

**Banned in MVP:**

> Drop a screenshot of your Google Calendar so we can schedule around it.  
> Enable the mic to continue.

## Success metrics

### MVP

- Zero production prompts for voice/screenshots.
- Calendar P0 bugs reproducible from logs without FB-18 attachments.

### Phase 2 (later)

- Voice sessions complete confirm-before-write at similar quality to text.
- Screenshot intake: user accepts/edits extraction **before** propose; no silent calendar writes.
- First-session duration may drop for voice users (ties back to FB-06) without changing the 7-day trial by accident.

## Risks

- Shipping a fake mic button that doesn’t work destroys trust (same class as wrong calendar drafts).
- Vision that auto-classifies habits and dumps 7 morning blocks = FB-13 again. Extraction must be **user-confirmed text**, then the normal engine + P0 placement rules.
- Privacy: photos of family calendars.

## Dependencies

- Engine already channel-agnostic — **protect this** in MVP PRs.
- Anthropic model via `ANTHROPIC_MODEL` / `src/lib/anthropic/model.ts` — don’t hardcode a vision model id in random files when Phase 2 happens; one config path.
- Confirm-before-write: `propose` vs `confirm` routes.
- Spec Phase 2 list: SMS, voice notes over SMS, live voice, Apple Calendar, native app, ML personalization — this PRD covers **voice channel + screenshot vision** only.

## Open questions (Phase 2)

1. Browser-only mic vs native app — native is a **separate** Phase 2 item; web push-to-talk can ship first.
2. Which vision model / whether images go to Anthropic vs a dedicated OCR — decide at Phase 2 kickoff.
3. Retention: delete uploads after extraction?

## Suggested implementation surfaces (Phase 2; do not build now)

| Area | Where |
| --- | --- |
| Engines (callers only change) | `src/lib/engine/engine.ts`, `src/lib/engine/weeklySession.ts` |
| HTTP adapters | `src/app/api/weekly-session/step/route.ts`, `src/app/api/engine/step/route.ts` |
| Future channel wrappers | new module under `src/lib/` (not NextResponse inside engine) |
| Chat UI | `src/app/(app)/weekly-session/page.tsx`, `ChatBits.tsx` |
| Calendar truth remains Google API | `src/lib/google/calendar.ts`, `tokens.ts` |
| Writes still only | `src/app/api/weekly-session/confirm/route.ts` |

## Relationship to other PRDs

- P0 calendar honor: use **logs**, not production screenshot-intake.
- Day-parts, chips, operating loop, KPI copy, positioning: all MVP; **none** should wait on this file.
