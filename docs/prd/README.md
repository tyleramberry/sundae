# Sundae PRDs

Product requirements from Brooklyn’s first weekly session (structured notes: [`docs/feedback/brooklyn-beta-notes.md`](../feedback/brooklyn-beta-notes.md)). Spec constraints: [`docs/MVP-spec.md`](../MVP-spec.md).

These PRDs are **implementation-ready and scoped**. They do not change architecture conventions: confirm-before-write calendar; KPI math only in `src/lib/kpi/compute.ts`; engine stays channel-agnostic (no `NextResponse` in engine modules); engine is Claude, not regex; `percent: null` (nothing planned) is not `0`; voice / SMS / push / native app are Phase 2.

Activation metric remains **Stripe trial + onboarding + first weekly session**, not week 2.

## Priority index

| Priority | PRD | Feedback | Intent |
| --- | --- | --- | --- |
| **P0** | [honor-stated-schedule-on-proposal.md](honor-stated-schedule-on-proposal.md) | FB-13, FB-15 (FB-18 evidence gap) | Draft blocks must match stated day and day-part/clock. Trust-breaker. |
| **P1** | [day-part-and-flexible-time.md](day-part-and-flexible-time.md) | FB-08 | Accept “morning sometime” / “I don’t care” as a window; stop clock interrogation. **Changes the current engine rule.** |
| **P1** | [first-session-time-and-trial.md](first-session-time-and-trial.md) | FB-06, FB-07 | Honest first-sitting length; week 2 is payoff not the success metric. Copy now; billing experiments are a **decision**, not a silent Stripe change. |
| **P2** | [post-plan-operating-loop.md](post-plan-operating-loop.md) | FB-16, FB-07 | After confirm: in-app check-in + **email** reminders. No push. |
| **P2** | [explain-goal-types-and-kpi.md](explain-goal-types-and-kpi.md) | FB-09, FB-17 | Habits vs goals vs projects in user language; score is a fraction, empty ≠ 0%. |
| **P2** | [proactive-jogs-and-session-chips.md](proactive-jogs-and-session-chips.md) | FB-01, FB-02, FB-11, FB-03 | Bounded role/priority jogs, Move on / Add chips, first-name greeting. Keep park-and-return. Cap length. |
| **P2** | [calendar-context-while-planning.md](calendar-context-while-planning.md) | FB-12 | Surface existing Google events in confirm / briefing. Don’t rebuild OAuth. Month-ahead is nice-to-have. |
| **P2** | [positioning-organize-life-areas.md](positioning-organize-life-areas.md) | FB-10 | Marketing: organize thoughts → plans per life area → track. Calendar is delivery. See `docs/launch-day-copy.md`. |
| **Phase 2** | [phase-2-voice-and-screenshot-intake.md](phase-2-voice-and-screenshot-intake.md) | FB-05, FB-04, FB-18 | Voice channel and screenshot vision **out of MVP**. Do not prompt for either until they exist. |

## Suggested implementation order

1. P0 calendar honor (placement + weekday + cadence extras) — without this, other session UX still ships a lying draft.
2. P1 day-part engine rule (otherwise P0 “honor afternoon” fights the prompt that forbids day-parts).
3. P1 first-session / trial copy (activation, no billing surprise).
4. P2 operating loop, KPI language, chips/jogs, calendar briefing, positioning — parallelizable.
5. Phase 2 only after MVP loop is trusted.

## Out of scope across all PRDs

- Apple Calendar / Outlook
- SMS, push notifications, native app
- Auto-write to Google Calendar without confirm
- ML personalization / “gets smarter every week”
- Yearly-goals product
- Asking users to paste screenshots or use voice in production copy before those channels exist
