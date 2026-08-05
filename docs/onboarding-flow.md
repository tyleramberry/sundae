# Sundae — Onboarding Question Tree (Day 6 draft)

Written before any UI exists (per the 30-day calendar) so it can be shared for
feedback and used directly as the spec for the engine's onboarding state
machine ([src/lib/engine](../src/lib/engine)) and the eventual UI (Day 7).

Flow shape: **roles → per-role big three → confirmation.**

---

## 1. Roles

**Q1.** "What are the different hats you wear day to day? Add as many as
apply — you can always change these later."

- Free-text chips, user adds one at a time (e.g. "Founder", "Husband",
  "Athlete", "Board member").
- Minimum 1 role, no hard maximum — soft nudge ("most people land on 3-5") if
  they try to add a 7th.
- No preset list. Forcing a taxonomy here would flatten exactly the kind of
  personal framing ("Dad" vs "Parent" vs "Family") that makes the weekly
  session feel like it's about *their* life.

**Q2 (confirm).** "Here's what I've got: {role list}. Anything to add, cut,
or rename before we go role by role?"

- Edit loop until the user says the list is right.
- Exit condition: explicit "looks good" / equivalent affirmative.

---

## 2. Per-role big three

Runs once per role, in the order the user listed them. Same three questions
each time — repetition is intentional, it's what makes the engine's logic
reusable across roles instead of bespoke per role.

For role `{role}`:

**Q3.** "As {role}, what are the 2-3 things that matter most to you right
now? These don't have to be this week's tasks — think bigger picture."

- Free text, engine parses into up to 3 discrete goal strings.
- If the user gives more than 3, ask: "Want to narrow that to your top three
  for {role}, or keep all {n}?" — don't force a cut.
- If the user gives 0 or clearly punts ("not sure"), engine offers one
  gentle prompt with an example ("For a lot of founders that's something
  like 'ship the MVP' or 'close the seed round' — anything like that for
  you?") then accepts whatever comes back, including "skip."

**Q4.** "Anything already on your calendar or in motion for {role} that
these should work around?" *(context only — not yet a proposal step; block
proposals are Day 8 scope.)*

- Free text, optional. A blank/"no" answer is valid and moves the flow on.

**Q5 (per-role confirm).** "For {role}: {goal 1}, {goal 2}, {goal 3}. Sound
right?"

- If yes → advance to next role (or overall confirmation if this was the
  last role).
- If no → re-ask Q3 for this role only; state for other roles is untouched.

---

## 3. Overall confirmation

**Q6.** Full summary across all roles:

```
{role A}: {goal 1}, {goal 2}, {goal 3}
{role B}: {goal 1}, {goal 2}
...
```

"That's your starting point. I'll check in on these in your first weekly
session. Ready to lock it in?"

- Yes → persist roles + per-role goals to Supabase, onboarding marked
  complete.
- No → user names which role to revisit; engine routes back into that
  role's Q3 loop, others stay locked.

---

## Design notes

- **No skipping roles once named.** If a user adds a role in Q1, they go
  through its big-three loop — cutting a role happens explicitly in Q2's
  edit loop, not by silently ignoring it later.
- **Everything editable until Q6.** Nothing is "locked" (i.e. written to
  Supabase) until final confirmation, so early mistakes are cheap to fix
  mid-flow.
- **State only needs to hold:** role list, current role index, per-role
  answers-so-far, and which question within the current role is active.
  That's the whole `ConversationState` shape the engine needs — see
  [src/lib/engine/types.ts](../src/lib/engine/types.ts).
- **Out of scope for this flow:** block proposals, calendar reads/writes.
  This is pure conversation — Day 8 is where roles/goals turn into calendar
  slots.

## Open questions for audience feedback (today's content post)

1. Is three questions per role the right depth, or does it feel like too
   much friction for someone with 5 roles (15 questions before they see any
   payoff)?
2. Should Q4 (existing commitments) be per-role, or asked once up front
   ("what's already fixed on your calendar this week?") since it's really
   about the whole calendar, not the role?
3. Is "big three" the right framing, or should roles with genuinely one
   priority be allowed to stop at one/two without the engine nudging for a
   third?
