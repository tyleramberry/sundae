# Sundae — Weekly Session Flow (Day 6 draft, written Day 10)

The spec for the **recurring** weekly session — distinct from
[onboarding-flow.md](onboarding-flow.md), which only runs once. This is the
engine-level detail underneath `docs/MVP-spec.md`'s "Goal types & KPI logic"
section, written concretely enough to build
[src/lib/engine/weeklySession.ts](../src/lib/engine/weeklySession.ts) and the
`weekly_items` schema against directly.

Runs once per sitting, three stages in order: **Accountability → Goal
Setting → Planning.** Same engine philosophy as onboarding — state is the
transcript, Claude does the understanding, the caller owns persistence (see
[src/lib/engine/types.ts](../src/lib/engine/types.ts)).

## This is the product

Sundae's value isn't "type your goals into a form and get a calendar back."
It's that **the agent asks the questions a good planner would ask you** —
it doesn't take the first thing you type and run with it. Goal Setting and
Planning (Stages 2 and 3 below) are one continuous line of questioning per
role, not two separate form fields:

1. **Context.** Open the role up — what's actually on the user's mind for
   {role} right now. Not a goal yet, just the raw material.
2. **Drill down to a goal.** If what comes back is vague, blank, or a
   deflection, reframe and ask again from a different angle — don't accept
   "be productive" as a goal. Keep going until the goal clears the SMART
   bar below.
3. **Drill down again, from goal to action items.** A named goal
   ("close the seed round") is not yet a plan. Once the user has a real
   goal, the agent asks a *further* question to surface what would actually
   move it this week — that follow-up is what produces the concrete action
   items Planning classifies into Habit/Goal/Project below. The engine
   never silently infers actions from a one-line goal statement; it asks
   for them, and each action item gets held to the same SMART bar.

Same role, same conversation, no stage boundary the user notices — but
internally this doc treats "get to a goal" (Stage 2) and "get to action
items" (start of Stage 3) as two distinct questioning moves, because they
need different framing and because Stage 3's classification logic operates
on the action items, not the goal statement.

### The SMART bar — what makes an answer "real"

**A reply doesn't end the drill-down just because it's a full sentence.**
It has to clear SMART — **S**pecific, **M**easurable, **A**ttainable,
**R**ealistic, **T**imely — before the agent accepts it as a goal (Stage 2)
or an action item (Stage 3). Anything short of that is classified
internally as vague, no matter how confident it sounds ("grow the
business" reads like a real answer but fails Specific and Measurable), and
routes back into another reframe rather than getting logged.

What each letter means here, concretely, and the question the agent reaches
for when it's missing:

- **Specific** — names an actual thing, not a direction. *"Grow the
  business"* fails; *"close the seed round"* passes.
  → Missing it: *"What specifically would that involve?"*
- **Measurable** — there's a clear way to know it's done. This isn't
  academic — it's exactly what `weekly_items` needs to track it
  (Habit/Goal = checkbox, Project = %). If the agent can't picture what
  "done" looks like, the row can't either.
  → Missing it: **"What does success look like for this?"**
- **Attainable** — realistically gettable by this user, not a pure stretch
  goal. The agent isn't the judge of someone's ambition, just checks that
  the *action item* (not the aspiration behind it) is something a week of
  real effort can actually move.
  → Missing it: *"What would actually be doable here, this week?"*
- **Realistic** — fits this week's actual capacity, not a rewrite of the
  user's whole life. Distinct from Attainable: Attainable asks "is this
  possible at all," Realistic asks "is this possible *for you, this
  week,* given everything else on your plate."
  → Missing it: *"Is that realistic to fit in this week specifically?"*
- **Timely** — has a clear timeframe. Most action items are implicitly
  "this week" by virtue of the session itself, but that's not automatic —
  a goal that's bigger than one week (see below) needs its own check.
  → Missing it: **"When do you need this done by?"**

**Timely doubles as a classification signal, and drives one more narrowing
question.** If the honest answer to the timeframe question is "not really
this week, this is more ongoing," the agent does not force an artificial
weekly deadline onto it, and it does not drop the goal either — it asks the
user to name a piece of it that IS doable this week:
**"What's a piece of that you could make real, visible progress on just
this week?"**

That narrowed, this-week-scoped answer — not the original multi-week
aspiration — is what actually gets classified in Stage 3 below, and it
commonly lands as **Project** rather than Habit/Goal: "make progress on
closing the round" is rarely a clean checkbox, even when the deck-and-calls
work behind it is real. That's fine — a Project's slider not reaching 100%
by the end of the week is **not a failure state**, it's the normal outcome
for a multi-week push. It gets picked up exactly the way any other
unfinished item does: next week's Accountability stage (Stage 1) asks
whether it rolls into next week. No separate mechanic, and no percent
carries forward automatically — each week's chunk (and its slider) starts
fresh and gets its own narrowing question, same as the "each week starts a
fresh count" rule in the KPI logic below.

The agent doesn't run through all five letters as a checklist out loud —
it asks whichever single question addresses what's actually missing, the
same "reframe, don't repeat" approach as the rest of the drill-down, and
stops asking as soon as the reply is genuinely SMART.

**Worked example, role = Founder:**

> **Agent:** What's the most important thing you can do this week as
> Founder?
> **User:** Grow the business.
> **Agent (reframe — fails Specific/Measurable):** If you could only get
> one thing done this week, what would make it feel like a successful
> week?
> **User:** Probably closing the seed round.
> **Agent (SMART check — Timely/Realistic: is this a one-week goal or
> bigger?):** Is closing the round something you can wrap this week, or is
> this more of an ongoing push you'll be chipping away at?
> **User:** Ongoing — probably a few more weeks.
> **Agent (narrowing question — goal spans beyond this week):** Got it —
> what's a piece of that you could make real, visible progress on just
> this week?
> **User:** Getting real momentum with the two investors who went quiet,
> and getting the deck to a place I'm proud of.
> **Agent:** Captured as one item this week — "push the seed round
> forward: investor follow-up + deck." Moves to the next role.

That narrowed item is what Stage 3 classifies below — here it lands as
**Project** (a 0–100% slider, since "push forward" isn't a clean
done/not-done task) rather than Habit/Goal. Nothing about the multi-week
"close the seed round" aspiration itself becomes a `weekly_items` row —
only each week's scoped push does, and if the slider isn't at 100% by
week's end, that's an ordinary rollover conversation in next week's
Accountability stage, not a special case.

Not every multi-week goal resolves this way, though — see the next
section's note on why this outcome isn't guaranteed by the timeframe alone.

---

## Stage 1: Accountability (once, at the top of the session)

Runs exactly once per session, before any per-role question.

- Reads last week's `weekly_items` rows plus last week's roles/goals
  (`onboarding_answers.roles` + prior week's answers) for context.
- Asks: what went well (3 wins), what to improve (3 things), and — for
  anything from last week still not done — whether it rolls into this week
  or gets dropped.
- A rollover is **not** a carried-forward row. It becomes a brand-new
  `weekly_items` row under the new `week_start`, going through Planning like
  any other action this week. Nothing about last week's row changes except
  that it stays exactly as it was (done or not) — see "Rows are never
  deleted" below.
- Output: a short recap the engine can reference later in the session, plus
  the set of rollover decisions (which prior items become new items this
  week).

## Stage 2: Goal setting (once per role)

Runs once per role, **in role order from `onboarding_answers.roles`** — same
ordering convention as onboarding's per-role loop.

**This is a real Claude-driven conversation, not a single fixed question —
same pattern as the Day 7 onboarding rewrite
([src/lib/engine/engine.ts](../src/lib/engine/engine.ts)), not the
hand-rolled state machine it replaced.** The model reads the transcript and
decides what to ask next; there's no scripted follow-up ladder. This is the
core of the whole weekly session — the point isn't to log whatever the user
types first, it's to actually help them land on a real goal.

For role `{role}`:

**Opening Q (context).** "What's the most important thing you can do this
week as {role}?"

- Free text, open-ended by design — this is the "context" move from the
  questioning arc above, not a form field expecting a clean goal on the
  first try.
- **This stage's exit condition is a SMART goal, not just any reply** (see
  "The SMART bar" above). A reply that already clears Specific/Measurable/
  Attainable/Realistic/Timely ends the stage and moves to the next role. A
  reply that's still just raw context or a vague direction feeds straight
  into the drill-down below — the agent does not treat "I guess grow the
  business" as done and move on.
- An answer that names more than one distinct goal-shaped thing in a single
  sentence (e.g. "work out every day and stretch every night") is fine —
  each becomes its own action item once Stage 3's action-item question
  (below) is asked; Goal Setting doesn't need to split them itself.
- No per-role confirmation loop once a goal is reached — same lesson as
  onboarding's Day 7 revision (see onboarding-flow.md's Revision notes):
  one confirmation gate for the whole session, not one per role, happens
  implicitly at the Planning → confirmation-screen handoff (Day 10's wiring
  step), not inside the engine conversation itself.

### The drill-down: what happens when the answer isn't usable yet

If the response is blank, "I don't know," visibly vague ("just be
productive"), or otherwise fails the SMART bar above, the model does
**not** just repeat the same question — it reframes from a different angle
to spark a real answer. Two kinds of reframe, picked based on what's
actually missing:

**Reply is empty/deflecting/no direction at all** — spark a direction:

- "If you could only get one thing done this week, what would make it feel
  like a successful week?"
- "What's been nagging at you about {role} that you keep not getting to?"
- "If nothing else moved forward this week except one thing, what would you
  want it to be?"

**Reply has a direction but fails a specific SMART letter** — target that
gap directly rather than asking a generic follow-up:

- Not Specific/Measurable → **"What does success look like for this?"**
- No timeframe given → **"When do you need this done by?"**
- Sounds bigger than one week → "Is that something you can wrap this week,
  or is it more ongoing?" (see "Timely doubles as a classification signal"
  above)

This is a genuine back-and-forth, not a fixed fallback script triggered by
turn count — same "Claude reads the transcript and decides what's actually
been established" philosophy as onboarding's engine, applied here as a
coaching/drill-down loop instead of an extraction loop. The system prompt
gives the model the SMART bar plus a repertoire of reframing angles and
license to pick whichever fits what's actually missing, rather than working
through them in a fixed order or as a checklist read aloud to the user. It
keeps probing — reframing, not repeating — until a concrete, SMART goal
actually emerges, the same way a good coach won't accept "I dunno" and move
on.
- A user who explicitly wants to skip a role ("nothing this week", "skip
  this one") is allowed to — the model accepts that after one genuine
  drill-down attempt, it doesn't force a goal out of someone who really
  doesn't have one. That role gets 0 actions this week, which is fine per
  the KPI logic below (0/0 is a valid, shown state).

## Stage 3: Planning (once per role, looping per distinct action)

### Action-item Q (the second drill-down)

Before anything gets classified, the agent asks the question that turns a
goal into a plan: **"What would you actually need to *do* this week to
make progress on that?"** (or an equivalent phrasing tailored to what the
user's goal was). This is a real question in the transcript, not a silent
NLP split — see the worked example above. It's what produces the distinct
action items:

- A goal that's already a single concrete action ("renew my passport")
  can come back as one action item — the agent doesn't force multiple
  answers where there's only one real one.
- A goal that implies several moving pieces ("work out every day and
  stretch every night") comes back as multiple action items in one
  answer, or across a short follow-up if the user only names one thing at
  first and the agent asks "anything else, or is that the whole plan for
  this?" — same reframe-until-real philosophy as Stage 2, just aimed at
  completeness of the plan instead of existence of a goal.
- If the user's answer to *this* question is itself vague ("just work on
  it more"), the agent drills down again the same way it did for the goal
  itself in Stage 2 — every action item gets held to the same SMART bar,
  not a pass just because a goal already exists above it.
- Each action item needs its own Timely check, independent of the goal's.
  For a SMART-but-ongoing goal ("close the seed round," several weeks
  out), Stage 2's narrowing question ("what's a piece of that you could
  make real progress on just this week?") already scopes the answer down
  to this week before it ever reaches this Action-item Q — but "scoped to
  this week" doesn't automatically mean "cleanly countable." The narrowed
  answer can still resolve either way once classified below: a single
  ongoing **Project** push (see the worked example above — "push the seed
  round forward" isn't a checkbox even though it's this week's work), or,
  if the narrowed answer happens to name discrete atomic tasks instead
  ("email the two investors, send the deck by Friday"), separate **Goal**
  items. Same classification rule either way — what changed is only that
  the goal's own multi-week timeframe no longer leaks into the action
  item's timeframe.

Once the action items for a role's goal are captured, each gets its own
classification:

```ts
{ role: string, description: string, type: "habit" | "goal" | "project", cadenceCount?: number }
```

### Classification rule

The engine classifies — the user is never asked to pick a type directly:

- **Habit** — countable, recurring ("work out every morning", "stretch
  every night"). `cadenceCount` = the number of calendar blocks implied by
  the stated cadence.
- **Goal** — a single one-off task ("renew my passport"). Always exactly
  one block; `cadenceCount` is 1 (or omitted and treated as 1 — `blocks.ts`
  proposes exactly one slot either way).
- **Project** — a one-off, not-cleanly-countable goal ("close the seed
  round", "plan the anniversary trip"). No calendar block at all —
  `cadenceCount` is omitted, and Planning proposes an empty `blocks` array.
  Progress lives entirely in the in-app 0–100% slider (Day 12).

### Cadence-parsing rule

Cadence language is parsed straight into a block count — **there is no
separate "how many times?" question**:

- "every morning" / "every day" → 7
- "every night" → 7
- A stated N times/week ("3x a week") → N
- Anything that isn't recurring language at all → Goal, not Habit (single
  block)

This parsing happens inside the classification step itself, same turn as
the habit/goal/project decision — not a follow-up question to the user.

### Per-action drill-down (Habit/Goal only)

Once an action is classified as Habit or Goal, it's handed to
`src/lib/planning/blocks.ts` to propose `cadenceCount` (or 1) time slots
against existing calendar gaps — same gap-finding logic Day 8 already
built, just fed typed `ProposedAction`s instead of raw goal strings (Day
10's rework of that file). Project actions skip this entirely.

---

## Goal types & KPI logic

Mirrors `docs/MVP-spec.md`'s "Goal types & KPI logic" section — repeated
here as the engine-level formula Day 10's dashboard/cron code reads
directly:

```
role KPI = (habit blocks done + goals done + projects at 100%)
           / (total habit blocks + total goals + total projects)
```

- Everything under a role — habits, goals, projects — pools into **one**
  KPI fraction for that role. No per-action KPI.
- A role with nothing planned this week still shows 0/0, not a missing
  tile.
- Each week starts a fresh count. A rollover from Stage 1 is a new item
  under the new `week_start`, not a carry of the old denominator.

### Rows are never deleted

`weekly_items` rows persist once a week ends — only `removed_at` gets set
(by Day 11's reconciliation cron), and only for not-yet-done items whose
calendar block disappeared before completion. This is what makes both the
current-week dashboard (Day 12) and the 6-week trend view (Day 15) possible
from the same records, just grouped differently.

---

## Design notes

- **Out of scope for this flow doc:** the confirmation screen and calendar
  write step. This doc covers the conversation engine only — Day 10's
  wiring task is what takes the engine's classified output, shows it for
  user confirmation, and writes it to Google Calendar + `weekly_items`.
- **State is just the transcript**, same as onboarding — no hand-maintained
  stage machine. See the "why" in
  [src/lib/engine/engine.ts](../src/lib/engine/engine.ts)'s file header for
  the failure mode this avoids.
