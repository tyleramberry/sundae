# PRD: Post-plan operating loop

**Status:** Ready for engineering  
**Priority:** P2  
**Phase:** MVP (education + orientation). Push is Phase 2.  
**Feedback:** FB-16, FB-07  
**Tester:** Brooklyn, first weekly session  

## Problem

After Brooklyn confirmed a week, she did not know **what she was supposed to do tomorrow**. She expected **phone push** reminders. Sundae’s actual loop is: **email** daily brief + **email** follow-up nudge → open the app → log on `/daily-follow-ups`. Nothing about that was taught at the moment of maximum motivation (right after confirm).

FB-07 (time commitment / setup) is the same education problem earlier in the funnel: she wasn’t told the sitting is long the first time **and** that the weekly session is not the whole product — the week is lived in the app + inbox.

Promising push would be a lie. Native app and push are Phase 2 (`docs/MVP-spec.md`).

## Evidence

| ID | Report |
| --- | --- |
| FB-16 | Expected phone notifications; daily check-in unexplained |
| FB-07 | Setup and time commitment — not oriented to what the product asks of her after (and during) setup |

KEEP: conversation stay-on-task. Out of scope here.

## Goals

- Immediately after a successful confirm, explain the **operating loop in one screen** (or a short chat coda + dashboard banner): what to check, where, how she’s reminded.
- State clearly that reminders are **email**, not lock-screen push.
- Point at in-app logging (`/daily-follow-ups`) as the only place habits/goals/projects get checked off (email is not a reply channel).
- Orient time commitment: first sitting vs a normal week (detail in [first-session-time-and-trial.md](first-session-time-and-trial.md)); this PRD owns **after confirm** and a short “during the week” card.
- Do not add SMS, push, or auto calendar writes.

## Non-goals

- Push notifications, APNs, FCM, browser Web Push.
- SMS / WhatsApp.
- Logging via email reply.
- Changing cron auth (`src/lib/cron/auth.ts`) or relaxing `CRON_SECRET`.
- Changing KPI math (see [explain-goal-types-and-kpi.md](explain-goal-types-and-kpi.md)).
- Voice check-ins.

## User stories

1. As Brooklyn, after I confirm the week, I see: “Each day, Sundae emails you. Open the app and mark what happened — that’s how your weekly score stays honest.”
2. As Brooklyn, I know the email subject family and that it deep-links to `/daily-follow-ups`.
3. As Brooklyn, I am not told to “enable notifications” on my phone.
4. As Brooklyn, if I skip a day, I understand I can still log in-app; the next weekly Accountability stage will ask.

## Current behavior vs desired

### Current

- Confirm writes events + `weekly_items` (`/api/weekly-session/confirm`).
- Recap email exists (`src/lib/email/sessionRecap.ts`, `/api/email/session-recap`).
- Daily: `src/lib/email/dailyFollowUp.ts` + `src/lib/agents/dailyNudgeAgent.ts` + gather `src/lib/dailyBrief/gather.ts`, fired by `/api/cron/daily-follow-up`.
- Logging UI: `src/app/(app)/daily-follow-ups/page.tsx`, `src/app/api/weekly-items/log/route.ts`.
- Dashboard is read-only rings (`src/app/(app)/dashboard/page.tsx`); logging is not on the dashboard.
- No in-app post-confirm “how this week works” step. Sidebar has Daily follow-ups but discovery is weak.
- No push.

### Desired

- A **post-confirm orientation** (blocking or clearly modal — must be seen once per first confirm, skippable later) covering: email, in-app log, no phone push, optional “add sundae@ / Resend from-address to contacts.”
- Session recap email and first daily brief should **repeat** the same three facts (don’t rely on the modal alone).
- Dashboard empty/first-week state: one line “Log today on Daily follow-ups. We’ll email you; we don’t send phone alerts yet.”
- Pre-session orientation for duration lives in the trial PRD; this PRD may add a single sentence on the confirm screen: “After this, the work is daily check-ins in the app, nudged by email.”

## Requirements

1. After first successful confirm in a user’s life (and optionally after every confirm until dismissed): show **Operating loop** copy (below). Persist dismissal (`onboarding` survey JSON or a small flag on the user profile — implementer’s choice; do not invent a new product surface).
2. Copy must include the words **email** and must **not** include “we’ll notify your phone” / “push” / “SMS.”
3. Primary CTA: “Log today” → `/daily-follow-ups`. Secondary: “Go to dashboard.”
4. Recap email (`sessionRecap.ts`): add a footer paragraph matching the loop. Daily follow-up already deep-links to `/daily-follow-ups` — add one sentence that this **is** the check-in, not a phone alert.
5. Confirm button area (`weekly-session/page.tsx`): helper text under “Add to calendar” / confirm: reminders are email.
6. Do not send extra emails beyond existing recap + daily cron (no third spam stream). Education is copy on existing messages.
7. Browser `Notification.requestPermission` is **out of scope** (that would imply push).
8. Channel-agnostic engine is untouched; this is UI + email templates.

## UX copy sketches

**Post-confirm screen title:** How a Sundae week works

**Body:**

> Your plan is on Google Calendar (you just confirmed it).  
>  
> **During the week:** each morning you’ll get an **email** brief (yesterday + today’s focus). A second **email** nudges you to open Sundae and log what you did. Logging happens **in the app**, not by replying to the email.  
>  
> **There are no phone push alerts** in this version. If you want the reminder, watch your inbox (and add us to contacts so it doesn’t sit in spam).  
>  
> Your weekly score is simply how much of this plan you mark done — not a sleep-style grade.

**Buttons:** Log today’s items → `/daily-follow-ups` · See my week → `/dashboard`

**Under confirm CTA:**

> Nothing is written until you confirm. After that, check-ins are in-app; reminders are email only.

**Banned:**

> Turn on notifications so we can ping your phone.  
> Text us when you’re done.

## Success metrics

- First-session users who confirm: ≥ 80% see the loop screen (analytics event `operating_loop_viewed`).
- Qualitative: next Brooklyn-like debrief does not include “I thought it would text/push my phone” as a surprise.
- Secondary (not activation): daily-follow-up page visit within 48h of first confirm (email click + in-app). Activation metric stays first weekly session complete.

## Risks

- Extra screen feels like more setup (FB-07). Keep it **short**; one screen, not a tour.
- Users who don’t read email will still miss nudges — honest copy is better than fake push.
- Recap + daily + this screen could feel repetitive; keep to the same three facts.

## Dependencies

- [first-session-time-and-trial.md](first-session-time-and-trial.md) for pre-session duration; do not duplicate a 14-day billing change here.
- [explain-goal-types-and-kpi.md](explain-goal-types-and-kpi.md) for score language on the same screen (can share a sentence).
- Email from-address: `RESEND_FROM_EMAIL` / `src/lib/email/*`.
- Cron remains `vercel.json` → `/api/cron/daily-follow-up` guarded by `src/lib/cron/auth.ts`.

## Open questions

1. Show the loop on **every** confirm or first confirm only? **Recommendation:** first confirm mandatory; later confirms a one-line recap in the confirmation message the engine already returns.
2. Marketing site FAQ: add “Do you send phone notifications?” → “Not yet; email only.” Align with [positioning-organize-life-areas.md](positioning-organize-life-areas.md) / launch copy.

## Suggested implementation surfaces

| Area | Where |
| --- | --- |
| Confirm success UI | `src/app/(app)/weekly-session/page.tsx` |
| Logging | `src/app/(app)/daily-follow-ups/page.tsx`, `src/app/api/weekly-items/log/route.ts` |
| Dashboard hint | `src/app/(app)/dashboard/page.tsx`, `src/components/AppSidebar.tsx` |
| Recap email | `src/lib/email/sessionRecap.ts`, `src/lib/agents/sessionRecapAgent.ts` |
| Daily email | `src/lib/email/dailyFollowUp.ts`, `src/lib/agents/dailyNudgeAgent.ts`, `src/lib/dailyBrief/gather.ts` |
| Cron | `src/app/api/cron/daily-follow-up/route.ts`, `vercel.json` |
| Persist “seen loop” | onboarding survey persist or user metadata — `src/lib/onboardingSurvey/persist.ts` or equivalent |
