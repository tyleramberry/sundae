# PRD: Proactive jogs and session chips

**Status:** Ready for engineering  
**Priority:** P2  
**Phase:** MVP (bounded). Do not lengthen the first sitting without a cap.  
**Feedback:** FB-01, FB-02, FB-11, FB-03  
**Tester:** Brooklyn, first weekly session  

## Problem

Stage 0 asks what roles she wears and then accepts per-role priorities. Brooklyn wanted the agent to **jog** life areas she might forget, and a **completeness** nudge after priorities — but the session is already long (FB-06/FB-07). She also wanted **Move on** / **Add something** chips instead of typing “that’s it,” and a **Hey Brooklyn** greeting.

The conversation engine’s **park-and-return stay-on-task** is a **KEEP**. Jogs and chips must not yank her into a new topic mid-drill-down or revive regex routing.

## Evidence

| ID | Report |
| --- | --- |
| FB-01 | Jog more roles unprompted (sample probes below) |
| FB-02 | Deeper / completeness questions after priorities |
| FB-11 | Move on / Add something chips |
| FB-03 | First-name greeting “Hey Brooklyn” |

KEEP: stay-on-task (called out in structured notes). Related: first-session duration cap.

## Goals

- Bounded **role jogs**: at most a small set of unused life-area probes, never a laundry list in one turn.
- Bounded **priority completeness**: one check per role (or once at list confirm), not a second SMART inquisition (Stages 2–3 already drill actions).
- Chips that send **ordinary user messages** into the existing `processMessage` contract.
- First-name greeting when a name exists.
- **Hard cap** on extra questions so first session does not grow.

## Non-goals

- Inventing roles she didn’t accept.
- Type-picker for Habit/Goal/Project.
- Voice.
- Breaking park-and-return (e.g. chips that jump to another role while Planning is mid-action).
- ML of “people like Brooklyn also add Athlete.”

## User stories

1. As Brooklyn, after I list Founder and Partner, Sundae may ask **one** missed-hat probe (“Anyone you care for, or a faith/community hat?”) and then stop if I say no.
2. As Brooklyn, after I name priorities for Founder, I see **Move on** and **Add something** — Move on continues; Add something asks for one more.
3. As Brooklyn, if I mention gym while we’re on Founder, Sundae parks it and returns — chips on Founder don’t steal that behavior.
4. As Brooklyn, the first message can be “Hey Brooklyn, …” if that’s my name.

## Current behavior vs desired

### Current

- Stage 0: `src/lib/engine/engine.ts` — list roles, confirm list, 2–3 big-picture things per role, one final summary. Explicitly **does not** probe missing hats; **does not** ask calendar. Completeness is a single list confirm.
- Weekly session stay-on-task / park-and-return lives in `weeklySession.ts` prompt (KEEP).
- Chat UI: `src/app/(app)/weekly-session/page.tsx`, `src/components/weekly-session/ChatBits.tsx`, `RolesSetupScreen.tsx`. No suggestion chips.
- Greeting: generic. No first-name lookup in session UI (Google/Supabase `user_metadata` / `full_name` unused here).
- Stages after 0: Accountability → Goal setting → Planning every sitting.

### Desired

- Engine prompt: optional jog **once** after the initial role list, using a **short** menu of probes (seeded by Brooklyn), skipping any area already covered by her words.
- Completeness: **one** sentence after a role’s priorities in Stage 0: “Anything else that actually matters for {role} this season, or is that the set?”
- UI chips visible when the agent is waiting on “is the list OK?” / “anything else?” / end of a role’s Stage 2 opener — not during a nested SMART drill unless the model just asked a yes/no complete question.
- Greeting: resolve first name from auth profile; if missing, “Hey,” is fine. Don’t hallucinate “Brooklyn.”

## Brooklyn’s sample probes (seed)

Use as the **pool**, not a script. Pick **uncovered** themes only, **max 2 probes total** in Stage 0, preferably **one combined question**:

- Kids / people you care for
- School / studying / training
- Faith / community / volunteer
- Sport / gym / body-care you’d protect this week
- Home / household ops (bills, house, admin)
- Relationships beyond a partner already listed (friends, family of origin)

Example combined jog:

> Looking at that list — anywhere we skipped, like caregiving, school, faith/community, a sport you’d protect, or household ops?

## Requirements

### Caps (non-negotiable)

1. Stage 0 extra **agent questions** beyond today’s flow: **≤ 2** (e.g. one jog + one global completeness, **or** per-role completeness **without** a separate jog — implementer picks one design that stays ≤ 2 extra questions).
2. Per-role Stage 0 priorities: still **do not** read back and confirm each role (existing anti-interrogation rule). Completeness is one line, not a summary loop.
3. Weekly session Stages 2–3: **no new mandatory** completeness gauntlet. Optional chip **Add something** only when the engine is at a natural “is that the plan for {role}?” beat. **Move on** = user message “that’s enough for this role.”
4. Chip clicks must not add questions; they **answer**.

### Engine (Claude, channel-agnostic)

5. Update `engine.ts` system prompt: after first role dump, if the list is thin (< 2 roles) **or** always once — run **at most one** jog from the pool, skip themes already present, never invent a role from a “no.”
6. Park-and-return in `weeklySession.ts` **unchanged in spirit**. Chips are user text like “Move on” / “Add another role: …”
7. Teach the model that messages “That’s enough for this role” / “Add something else” are completeness answers, not new role names (avoid the old regex failure mode).
8. No `NextResponse` in engine modules.

### Chips (UI)

9. Two chips when relevant: **Move on** (sends a fixed utterance, e.g. `That's enough for this — move on.`) and **Add something** (sends `I want to add something.` so the model asks *what*, one question).
10. Disable chips while the agent is in a parked-item drill or waiting on a clock/duration question (don’t “Move on” off a half-captured action).
11. `ChatBits.tsx` or a sibling on the weekly-session page; reuse for Stage 0 and later stages with the same two labels.

### Greeting (P3, ship with this if cheap)

12. First assistant message of a sitting: `Hey {First},` using given name from Google/Supabase if it looks like a name (one token, not email). FB-03 is P3 — skip if name unresolved.
13. Recap/daily emails may use the same first name in `dailyNudgeAgent` **optional**; don’t block.

## UX copy sketches

**Greeting:**

> Hey Brooklyn — we’ll start with the hats you wear, then this week. You can tap Move on whenever a list feels complete.

**Jog (one turn):**

> Got Founder and Partner. Anywhere we skipped — caregiving, school, faith/community, a sport you’d protect, or running the household?

**Completeness:**

> That’s a solid Founder set. Add something, or move on?

**Chip labels:**

> Move on · Add something

**Banned:**

> Please also consider: (12-item checklist)  
> Is this a Habit or a Goal?  
> (Prompting voice or screenshots)

## Success metrics

- Stage 0 median turns do **not** increase by more than **+2** vs current.
- Qualitative: more complete role lists without “it felt like an interrogation.”
- Stay-on-task incidents do not increase (parked items still return).
- Chip use rate optional; success is **shorter typing**, not more goals for vanity.

## Risks

- Jogs that shame people (“you forgot your kids”). Keep optional and skippable via Move on.
- “Add something” loops; cap **one** add per role unless she chips again.
- First name from Google is a nickname / legal name mismatch — still OK vs “Hey user.”

## Dependencies

- [first-session-time-and-trial.md](first-session-time-and-trial.md) — duration honesty; this PRD must not blow the budget.
- `docs/weekly-session-flow.md` Stage 0.
- Auth profile: `src/lib/supabase/client.ts` / session user.

## Open questions

1. Jog only when `< 2` roles vs always one combined question? **Recommendation:** always **one** combined question after list-back, Move on skips it.
2. Chips in Stage 1 Accountability (wins/improves)? **Nice:** same two chips when asking “three wins.” Not required for MVP of this PRD.

## Suggested implementation surfaces

| Area | Where |
| --- | --- |
| Stage 0 prompt | `src/lib/engine/engine.ts`, `src/lib/engine/types.ts` |
| Stay-on-task (preserve) | `src/lib/engine/weeklySession.ts` |
| Step routes (wire only) | `src/app/api/engine/step/route.ts`, `src/app/api/weekly-session/step/route.ts` |
| Chat + chips | `src/components/weekly-session/ChatBits.tsx`, `RolesSetupScreen.tsx`, `src/app/(app)/weekly-session/page.tsx` |
| Greeting name | session page + `createClient()` user metadata |
| Optional email name | `src/lib/agents/dailyNudgeAgent.ts` |
