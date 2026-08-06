# Sundae — Onboarding Question Tree (Day 6 draft, revised Day 7)

Written before any UI exists (per the 30-day calendar) so it can be shared for
feedback and used directly as the spec for the engine's onboarding
conversation ([src/lib/engine](../src/lib/engine)) and the UI (Day 7).

**Revised after the first real run-through (Day 7):** the original draft had
a confirmation step after *every* role and a per-role question about
existing calendar commitments. Both got cut based on actually using it —
see "Revision notes" at the bottom for why.

Flow shape: **roles → per-role big three → one final confirmation.**

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

Runs once per role, in the order the user listed them. Same question each
time — repetition is intentional, it's what makes the engine's logic
reusable across roles instead of bespoke per role.

For role `{role}`:

**Q3.** "As {role}, what are the 2-3 things that matter most to you right
now? These don't have to be this week's tasks — think bigger picture."

- Free text, engine parses into discrete goal strings.
- If the user gives more than 3, ask: "Want to narrow that to your top three
  for {role}, or keep all {n}?" — don't force a cut.
- If the user gives 0 or clearly punts ("not sure"), engine offers one
  gentle prompt with an example ("For a lot of founders that's something
  like 'ship the MVP' or 'close the seed round' — anything like that for
  you?") then accepts whatever comes back, including "skip."
- Whatever they say, move straight to the next role's Q3. **No per-role
  confirmation and no calendar question** — see Revision notes.

---

## 3. Overall confirmation (the only confirmation step)

**Q4.** Full summary across all roles:

```
{role A}: {goal 1}, {goal 2}, {goal 3}
{role B}: {goal 1}, {goal 2}
...
```

"That's your starting point. Does this look right, or is there a role or a
goal you'd like to change?"

- Yes → persist roles + per-role goals to Supabase, onboarding marked
  complete.
- Wants a change → apply the edit (rename a role, add/cut/reword a goal),
  re-show the full summary, ask again. Repeat until confirmed. Edits are
  named directly against the summary ("change Founder's second goal to
  X") rather than routing back into a role-specific sub-loop — there's
  only one loop now, not one per role.

---

## Design notes

- **No skipping roles once named.** If a user adds a role in Q1, they go
  through its big-three loop — cutting a role happens explicitly in Q2's
  edit loop, or as an edit at the final Q4 summary.
- **Everything editable until Q4 is confirmed.** Nothing is "locked" (i.e.
  written to Supabase) until final confirmation, so early mistakes are
  cheap to fix.
- **State is just the transcript.** The engine understands the conversation
  by reading it, not by tracking a hand-maintained stage/index — see
  [src/lib/engine/types.ts](../src/lib/engine/types.ts) and the "why" in
  [src/lib/engine/engine.ts](../src/lib/engine/engine.ts)'s file header.
- **Out of scope for this flow:** block proposals. This is pure
  conversation — Day 8 is where roles/goals turn into calendar slots.
  Calendar *reads* are explicitly **in** scope for context, not out of
  scope — see Revision notes.

## Revision notes (Day 7, after the first real run-through)

The original draft above (Q3 → Q4 → Q5 per role) read fine on paper but was
rough in an actual conversation, twice:

1. **Per-role confirmation (old Q5) felt like an interrogation.** Confirming
   after every single role, on top of the one overall confirmation at the
   end, was one confirmation too many — it made a 3-role onboarding feel
   like 4 separate approval gates instead of one conversation. Cut down to
   a single confirmation at the very end (now Q4), with edits handled there
   directly rather than by revisiting each role's own sub-loop.
2. **The per-role calendar question (old Q4) worked against the product's
   own premise.** Sundae reads the user's Google Calendar directly — that
   integration already exists (Day 5,
   [src/lib/google/calendar.ts](../src/lib/google/calendar.ts)). Asking the
   user to manually describe what's already on their calendar, once per
   role, made them do by hand exactly what the app exists to do for them.
   Dropped entirely; the `context` field stays in the data model in case a
   user volunteers something relevant unprompted, but the engine never asks
   for it.

## Open questions for audience feedback (from the original Day 6 post)

1. Is three questions per role the right depth, or does it feel like too
   much friction for someone with 5 roles?
2. ~~Should the existing-commitments question be per-role or asked once up
   front?~~ Resolved (Day 7): dropped entirely — calendar reads already
   happen automatically.
3. Is "big three" the right framing, or should roles with genuinely one
   priority be allowed to stop at one/two without the engine nudging for a
   third?
