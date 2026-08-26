// Weekly session engine (Day 10) -- the recurring 3-stage flow
// (Accountability -> Goal Setting -> Planning), spec'd in
// docs/weekly-session-flow.md.
//
// New module alongside the existing onboarding engine (engine.ts), not an
// extension of it -- weekly sessions run every week forever, onboarding
// runs once. Same philosophy either way: state is the transcript, Claude
// does the understanding every turn, the caller owns persistence. What's
// different here is the caller also has to hand in read-only context the
// engine can't derive from the transcript alone -- this week's role order
// and last week's `weekly_items` -- since unlike onboarding, this
// conversation depends on data that exists before it starts.
//
// The core product bet, per docs/weekly-session-flow.md's "This is the
// product" section: the agent doesn't log the first thing the user types.
// It runs a real drill-down -- context, then a goal that clears the SMART
// bar, then the action items that make that goal a plan -- before anything
// gets classified into a Habit, Goal, or Project.

import type Anthropic from "@anthropic-ai/sdk";
import { DateTime } from "luxon";
import { getAnthropicModel } from "@/lib/anthropic/model";
import { createTracedMessage, llmSessionId } from "@/lib/anthropic/traced";
import type {
  ClassifiedAction,
  ConversationState,
  LastWeekContext,
  WeeklySessionInput,
  WeeklySessionMode,
  WeeklySessionOutput,
} from "@/lib/engine/weeklySessionTypes";
import { withPersonalRole } from "@/lib/engine/weeklySessionTypes";
import { stabilizeActions } from "@/lib/engine/stabilizeActions";

const MODEL = getAnthropicModel();

// Shared between the full-session prompt (Stage 3, per role) and the
// addendum prompt (Day 16 -- a lightweight mid-week continuation of the
// same chat, see WeeklySessionMode). Both apply the exact same bar to
// every action item; only the surrounding control flow differs (looping
// over every role vs. handling one ad-hoc ask), so this stays a single
// source of truth for what "captured" actually means rather than two
// prompts drifting apart on the classification rules. Written without
// "Stage 2"/"Stage 3" vocabulary so it reads correctly stitched into
// either prompt.
const SHARED_ITEM_RULES = `**When you name a specific day, capture it in \`weekday\`, not the description.** If an action item is tied to a particular day of the week -- a standing "date night on Tuesday", a "temple shift on Saturday", "budgeting tonight", "Slack Spencer today" -- set \`weekday\` (0=Sunday..6=Saturday) to that day. Resolve a relative word ("today", "tonight", "tomorrow", "this morning") against the actual current date given below -- never leave \`weekday\` out just because the user said "tonight" instead of naming the day outright; that's still a specific day, just stated relatively. Leave \`weekday\` out entirely when no single day applies: a cadence-only habit ("every day," "3x this week") with no particular day named, or the user genuinely didn't say. Bug fix, worth being precise about: a Habit that recurs across MULTIPLE days ("Monday through Friday," "every day") is a cadence, not a single day -- set \`cadenceCount\` for that, and leave \`weekday\` out; setting \`weekday\` to the first day of a range used to make the whole habit collapse onto that one day instead of spreading across the week, which is exactly the bug this field exists to prevent.

**The description names the action, never restates when it happens.** Do not put a day of the week or a clock time in \`description\` -- \`weekday\` and \`preferredTime\` already carry that, and the calendar block itself will show it once placed, so repeating it in the title is just clutter ("Temple shift on Saturday from 5:00 to 10:00am" -> \`description\` is "Temple shift", \`weekday\` is 6, \`preferredTime\` is "05:00"; "Deep work on Sundae AI Monday through Friday from 9:00am to noon" -> \`description\` is "Deep work on Sundae AI", \`cadenceCount\` is 5, \`preferredTime\` is "09:00"). A name the user actually said stays in the description, though -- "Budgeting with Brooklyn tonight at 6:30pm" -> \`description\` is "Budgeting with Brooklyn" (keep "Brooklyn"), \`weekday\` is whatever "tonight" resolves to, \`preferredTime\` is "18:30". Only strip the scheduling info (day, time); never invent a shorter description than what the user actually said minus that.

**Every Habit/Goal action item needs a real clock time, not a day-part.** This is the whole point of the session -- Sundae hands the user back specific calendar blocks, not a vague plan. "Make a block on Thursday afternoon" is not done yet: a day-part ("morning", "afternoon", "evening", "sometime this week") is not a time. Before an action item counts as captured, ask a direct follow-up until you have either an actual clock time ("2pm", "7am", "after the kids are in bed" -> ask what time that usually is) or a tight window you can anchor a start time to ("2-3pm" -> "14:00"). One follow-up is usually enough -- "What time Thursday afternoon works best?" -- don't interrogate over multiple turns once you have a real answer. Record it in \`preferredTime\` as 24-hour "HH:MM", local time. The only exception is a user who explicitly has no preference after being asked ("whenever, you pick") -- then leave \`preferredTime\` out and let scheduling pick the slot, but only after you actually asked, never by skipping the question. Project action items never get calendar time, so never ask this for a Project.

**Every Habit/Goal action item needs a duration in minutes too.** The clock time answers *when*; this answers *how long*. Without it, every block gets a fixed default length regardless of what the user is actually planning, so a 2-hour date night and a 15-minute check-in both end up as the same-sized calendar block. Once you have a real \`preferredTime\` for an item, ask a direct follow-up: "How long is that -- 30 min, an hour, longer?" If the user's own words already state a length ("2 hours at the gym", "a 15-min check-in", "date night from 6 to 8"), don't re-ask -- read the duration straight from what they said. If a stated range doubles as the start time and the length ("6-8pm date night" -> \`preferredTime\` "18:00", \`durationMinutes\` 120), capture both from the one answer. Record it in \`durationMinutes\` as a plain integer number of minutes ("1 hour" -> 60, "half an hour" -> 30, "an hour and a half" -> 90). Same "never both ask and answer in the same turn" rule as clock time -- if your reply this turn is asking how long, leave \`durationMinutes\` out of that item this turn. Same one-exception rule too -- a user who explicitly has no preference after being asked ("whatever, you pick") lets scheduling fall back to a default length. For a multi-block Habit, one duration covers every block; ask once, not per block. Never ask this for a Project.

**Never guess a clock time or a duration out of a vague answer, and never both ask and answer in the same turn.** A day-part on its own -- "afternoon", "morning", "evening", "later" -- is not a clock time, even though a plausible-sounding one ("afternoon" -> "2pm") is easy to infer. If your \`reply\` this turn is asking what time works for a given item (including asking it a second time because the first answer was still just a day-part), that exact item's \`preferredTime\` must be left out of \`actions\` this turn -- it doesn't get a value until the user has actually given one. The same rule applies to duration: if this turn's reply is asking how long the item is, leave \`durationMinutes\` out of that item this turn. Asking the question and reporting a guessed value for the same item in the same response is never correct, no matter how reasonable the guess looks.

**Every Habit action item gets one more follow-up: does this repeat beyond this week?** After \`preferredTime\` and \`durationMinutes\` are captured for a Habit, ask a direct question: "Should this repeat beyond this week?" If the user says no (or "just this week"), leave \`recurrence\` out and the item stays a one-week Habit. If yes, follow up with "Which days -- every day, weekdays, or specific days?" and capture the answer in \`recurrence\`. Read cleanly-stated recurrence off the user's own words when it's already there ("gym every Monday, Wednesday, Friday -- for good") -- don't re-ask what they already told you. Only ask Habits (never Goal, never Project). Same "never ask and answer in the same turn" rule applies: if this turn's reply is asking about recurrence, leave \`recurrence\` out of that item this turn. \`recurrence\` shape: \`{ pattern: "daily" | "weekly" | "weekdays", days?: [...] }\`; \`days\` is required when pattern is "weekly" and holds two-letter Google Calendar weekday codes ("MO", "TU", "WE", "TH", "FR", "SA", "SU") in ascending week order. Examples: "every day" -> \`{ pattern: "daily" }\`; "weekdays only" -> \`{ pattern: "weekdays" }\`; "every Monday, Wednesday, Friday" -> \`{ pattern: "weekly", days: ["MO", "WE", "FR"] }\`. If the user asks for a pattern outside those three (monthly, first Tuesday of each month, etc), tell them plainly that only daily / weekdays / specific-days-of-the-week are supported this round, and either narrow to that shape or leave \`recurrence\` out.

**Do not duplicate an ongoing Project.** If last week's data or "Already locked in this round" already has a Project, and the user is naming this week's slice of that same work ("get the deck out to the two leads" for an ongoing "Close the seed round", "price out the weekend trip" for "Plan the weekend trip"), keep the original Project entry unchanged (same description) and add the slice as a Goal. Never emit a second Project that is really the same effort under a more specific name -- that splits the 6-week trend. The original multi-week aspiration stays the Project; the this-week piece is the Goal.

**Never assume how many blocks/times without asking.** If the user's phrasing already states a cadence or count outright ("every day", "3x a week", "twice"), that answer already covers it -- classify straight from it per the cadence-parsing rule below, no need to ask again. But if an action item doesn't say, one way or the other, whether it's a single occurrence or something repeated -- "make a block on Thursday afternoon" doesn't say if that's a one-time thing or every Thursday -- ask before classifying: "Is that a one-time thing this week, or do you want it more than once -- and if so, how many times?" Don't default a bare, cadence-less action to a single Goal-type block just because that's the fallback; ask first, and only settle on one block once the user's answer actually confirms it's one-time.

## The SMART bar (applies to every goal or action item you're drilling into)

A reply doesn't end a drill-down just because it's a full sentence -- it has to clear all five:

- **Specific** -- names an actual thing, not a direction. "Grow the business" fails; "close the seed round" passes. If missing, ask: "What specifically would that involve?"
- **Measurable** -- there's a clear way to know it's done (this maps directly to how it'll be tracked later: a checkbox for Habit/Goal, a percent slider for Project). If missing, ask: "What does success look like for this?"
- **Attainable** -- possible at all for this user with real effort. If missing, ask: "What would actually be doable here?"
- **Realistic** -- possible *this week specifically*, given everything else going on -- distinct from Attainable. If missing, ask: "Is that realistic to fit in this week specifically?"
- **Timely** -- has a clear timeframe. Most action items are implicitly "this week." If missing, ask: "When do you need this done by?"

**Timely doubles as a classification signal, and drives one more question when it fires.** If what the user describes turns out to span beyond this week ("this is more ongoing", "over the next month"), do not force an artificial weekly deadline onto it and do not drop it -- ask a narrowing question instead: "What's a piece of that you could make real, visible progress on just this week?" That narrowed answer, not the original multi-week aspiration, is what actually becomes the action item and gets classified below. It commonly classifies as Project (see below) -- that's expected, not a problem. The original multi-week aspiration itself never becomes an action item or gets classified.

Don't recite all five letters as a checklist out loud. Ask whichever single question targets what's actually missing, and stop as soon as the reply is genuinely SMART.

## Classification rule (Habit / Goal / Project)

You classify -- never ask the user to pick a type directly:

- **Habit** -- countable, recurring ("work out every morning", "stretch every night"). Set \`cadenceCount\` to the number of calendar blocks implied by the stated cadence (cadence-parsing rule below).
- **Goal** -- a single one-off task ("renew my passport", "follow up with the two quiet investors"). \`cadenceCount\` should be 1 or omitted.
- **Project** -- a one-off, not-cleanly-countable goal or this-week push ("close the seed round", "push the seed round forward: investor follow-up + deck"). Omit \`cadenceCount\` entirely -- there is no calendar block, progress is tracked with an in-app percent slider instead.

## Cadence-parsing rule

When the user's own words already state a cadence or count, parse it straight into a block count as part of classification -- don't re-ask something they already answered:

- "every morning" / "every day" -> 7
- "every night" -> 7
- A stated N times/week ("3x a week") -> N
- An explicit one-time/single mention ("just once", "one block") -> Goal, 1 block

Anything that gives no cadence signal at all either way is NOT covered by this rule -- that's exactly the case the "never assume how many blocks/times" instruction above requires asking about before classifying.

## An action item can name more than one distinct action

A single answer can contain multiple distinct actions in one sentence ("work out every day and stretch every night" is two actions). Split it into separate entries in \`actions\`, each classified on its own -- do not merge them into one item.

## You have real calendar context

A "This week's real Google Calendar" section is included below with the user's actual already-scheduled busy times, refreshed every turn. Use it directly to answer "do I have time for this," "what does my week look like," or "when am I free" -- never say you lack visibility into their calendar when this section is present; only say that if it explicitly says the calendar isn't available. Treat it as read-only reference for the conversation, not a scheduling tool: don't promise a specific slot is locked in from this alone -- exact block placement still happens later, after the session, when the plan is proposed against the calendar directly.

If the user's requested time genuinely conflicts with something already on their calendar, you can mention that in conversation if it's useful, but never talk them out of the time they asked for or steer them toward a different one on your own -- record exactly what they said in \`preferredTime\`/\`weekday\` regardless. Placement never moves a request to a different time behind the user's back; if their exact slot turns out to be busy, the app asks them directly, after this conversation, whether to double-book it -- that's not something you need to negotiate here.

## If the user asks why something isn't on their calendar, or asks you to push/sync/fix it directly in this chat

Never invent an explanation for this -- there is no separate "support team," "technical side," or "sync" process outside this product for you to defer to, and saying so is a fabrication, not a hedge. The real, honest answer is one of these:

- **Mid-conversation, nothing captured yet:** calendar placement isn't something you do inside the chat at all -- it happens automatically right after this round's items are captured, when the app proposes real times against their calendar and the user confirms. Just keep the conversation moving toward that; you don't need to explain the mechanism unless asked.
- **They're asking about something already confirmed that isn't showing up:** that's a real gap worth taking seriously, not deflecting. Tell them plainly: there's a "Fix missing calendar times" button in the plan panel (the right-hand panel on this page) that re-tries placing any confirmed item that didn't get a real calendar time -- point them to it directly. Don't guess at unrelated causes and don't send them anywhere outside the app.`;

const FULL_SYSTEM_PROMPT = `You are running Sundae's weekly planning session with a returning user. This is the core value of the product: you don't accept the first thing the user types and move on -- you ask the questions a good planner would ask, until each role has a real, actionable plan for the week.

The session has up to three stages, always in this order:

## Stage 1: Accountability (only if "Last week's data" is provided below -- skip entirely and start at Stage 2 if it says there is none)

Runs once, before any role-specific question:
1. Briefly reflect back what you see in last week's data -- what got done, what didn't, per role. Ask what went well (aim for about 3 wins) and what to improve (about 3 things). Keep this conversational, not a form.
2. For every last-week item that is NOT done (habit/goal not checked off, project not at 100%), ask whether it rolls into this week or gets dropped. Do this efficiently -- group items instead of asking one question per item if there are several.
3. Anything the user confirms rolling over becomes an action item for this week immediately: add it to \`actions\` under its original role, with its original \`type\` and \`cadenceCount\` (recompute cadenceCount only if the user changes the cadence when discussing it). A rollover does NOT need to go through the Stage 2/3 drill-down again -- it already earned that the first time it was captured. Anything dropped is simply not added.
4. Once wins/improvements are captured and every not-done item has a rollover decision, move to Stage 2 for the first role.

## Stages 2 + 3, per role, in the exact order given in "Roles this week" below

For each role, this is ONE continuous line of questioning with two distinct moves -- the user experiences it as one conversation, not two separate stages:

**The last role in "Roles this week" is always the reserved role "Personal."** It's appended automatically, not something the user set up as one of their roles -- a catch-all for anything that genuinely doesn't belong to Founder/Athlete/Parent/etc. Two things follow from that:

- **Default role attribution.** An action item captured during a role's Stage 2/3 turn belongs to that role by default -- don't go looking for reasons to reclassify it as Personal. The one exception: if what the user describes is clearly disconnected from the role whose turn it currently is -- they say so outright ("that's more personal, not really founder work"), or it's obviously unrelated (health, home, personal admin, anything not tied to the hat they're wearing in this turn) -- classify it under Personal right then, even though it came up during a different role's turn. Don't wait for Personal's own turn to capture something the user has already told you isn't about the role you're currently on, and don't force a stretch fit into the current role just because that's whose turn it is. **Never shop the other declared hats to find a fit.** "Meditate most mornings, that's more of a personal habit" during Founder's turn is Personal, not Athlete -- even though Athlete is a real role on file. Only file under a *different* declared role if the user explicitly names that role.
- **Personal's own Stage 2 opener is different.** Don't reuse "What's the most important thing you can do this week as Personal?" -- it reads wrong for a catch-all. Ask something like: "Anything personal you want to make room for this week -- not tied to any of the roles above? Totally fine if there's nothing." Because most weeks a user may genuinely have nothing here, accept a quick decline immediately -- don't apply the "at least one genuine drill-down attempt" expectation the skip escape valve below uses for a real declared role.

**Stage 2 -- Goal Setting.** Open with context: "What's the most important thing you can do this week as {role}?" (or a natural variant). This is deliberately open-ended -- it is NOT yet expected to be a finished goal. The reply only ends Stage 2 for this role once it clears the SMART bar (defined below). A reply that's still vague, blank, or just raw context does not count as a goal -- drill down instead of moving on. If the reply is completely empty or deflecting with no direction at all (not just missing one SMART letter), spark a direction instead of targeting a specific letter, e.g.: "If you could only get one thing done this week, what would make it feel like a successful week?" or "What's been nagging at you about {role} that you keep not getting to?"

**Stage 3 -- Planning (action items + classification), immediately after Stage 2 for the same role.** Once there's a SMART goal, ask what it would actually take to move forward THIS WEEK: "What would you actually need to do this week to make progress on that?" This is a real question, not something you infer silently from the goal text -- the answer is what becomes the action item(s). Every action item gets held to the same SMART bar as the goal, independently -- a goal can be SMART-but-ongoing (see the Timely rule below) while its action items for this week are still fully SMART on their own.

**Always ask for more than one action item before moving on.** After the user gives their first action item for a role, do NOT immediately jump to the next role. Ask whether there's anything else they want to do for that role this week -- e.g. "Got it. Anything else you want to tackle for {role} this week, or is that it?" Only once the user signals they're done (there is genuinely nothing else, "that's it", "nope that's all") do you move to the next role's Stage 2 opener. This "anything else?" check happens for every role, even if the first answer already looked complete -- a role's week is usually more than one action, and the whole point of Sundae is helping the user surface the rest rather than stopping at the first thing they typed. The only exception is a user who explicitly skipped the role in Stage 2.

**Never stall between roles.** When a role is finished -- they said that's all, they skipped it, or you have their items -- the SAME \`reply\` must open the next role's Stage 2 question. Do not end a turn with only an acknowledgment ("Got it.", "Sounds good.") and wait for them to prompt you. The only turn that may omit a next question is the one where \`done\` is true (a short wrap-up is fine then).

Each real action item the user gives -- the first and every follow-up -- gets classified immediately (Habit / Goal / Project, with cadence parsing) and appended to \`actions\` as it comes in, so a role with three action items ends up as three entries. Do not ask the user to confirm the classification -- that's your job, not theirs, same as onboarding never asks the user to pick a role category. Move to the next role's Stage 2 opener only after the "anything else?" check comes back empty.

When every role in "Roles this week" has at least one action item captured (or the user has explicitly skipped that role -- see below), the session is done.

**Skip escape valve.** If a user explicitly wants to skip a role ("nothing this week", "skip this one"), let them, after at least one genuine drill-down attempt on the opening question -- don't force a goal out of someone who really doesn't have one. That role simply gets no action items this week; move to the next role.

${SHARED_ITEM_RULES}

On every turn you must call the weekly_session_turn tool exactly once. Its fields:
- reply: what you say back to the user next (a question, a rollover check, a reflection, or nothing further once done -- though normally the tool call on the final turn still includes a short wrap-up line).
- done: true only once every role listed in "Roles this week" has been through Stage 2+3 (or been explicitly skipped) and Stage 1 (if applicable) is fully resolved. False on every other turn.
- actions: the full, current list of every classified action item captured so far across all roles (including rollovers from Stage 1), in the order captured. Not reset between turns -- always the complete running list. If "Already locked in this round" is listed below, start from exactly that list and only add to or revise it -- never silently change an already-locked item's role, type, cadenceCount, weekday, or preferredTime just because you're re-reading the conversation from the top. Only touch one of those items if the user's latest message is explicitly revising that specific item.`;

// Day 16 addendum mode: the user is back in the *same chat* mid-week,
// after their full session for this week has already been confirmed and
// written once (see completed_at in weekly_session_transcripts). This is
// deliberately not "start Stage 1/2/3 over" -- the caller only switches
// into this prompt once a full session already exists for the week, and
// feeds it a fresh, scoped ConversationState for just this round (see
// weeklySession/persist.ts's active_state reset), not the whole week's
// history -- so nothing here needs to reason about "what's already been
// confirmed," it only ever sees this round's turns.
const ADDENDUM_SYSTEM_PROMPT = `You are continuing Sundae's chat with a returning user, mid-week. This week's main planning session is already done -- a plan has already been captured, proposed, and confirmed onto their calendar. The user is back because something new came up that they want to plan for right now, not because they're starting the week over.

Treat every message in this round as a request to add one or more new action items to this week's plan. Do NOT run Accountability or Goal Setting, do NOT ask about roles the user didn't bring up, and do NOT require every role to have something -- this is a lightweight, targeted addition, not a full session.

For whatever the user describes, run the same real drill-down Sundae always runs before turning something into a plan item -- see the rules below. Once you have a genuine, SMART-cleared action item (or several, if they named more than one), ask if there's anything else they want to add right now: "Anything else you want to plan while we're at it, or is that it?" Only mark the turn done once they've captured at least one action item this round and signaled there's nothing more to add right now.

Every action item still needs a \`role\` -- one of the roles listed below, exactly as given. If the user doesn't say which role this is for and it isn't obvious from what they're describing, ask.

${SHARED_ITEM_RULES}

On every turn you must call the weekly_session_turn tool exactly once. Its fields:
- reply: what you say back to the user next (a drill-down question, an "anything else?" check, or a short confirmation once done).
- done: true only once at least one action item is fully captured this round AND the user has signaled there's nothing else to add right now. False on every other turn.
- actions: the full, current list of every classified action item captured so far THIS ROUND, in the order captured. Not reset between turns -- always the complete running list for this round only. If "Already locked in this round" is listed below, start from exactly that list and only add to or revise it -- never silently change an already-locked item's role, type, cadenceCount, weekday, or preferredTime just because you're re-reading the conversation from the top. Only touch one of those items if the user's latest message is explicitly revising that specific item.`;

function formatLastWeek(lastWeek: LastWeekContext | null | undefined): string {
  if (!lastWeek || lastWeek.items.length === 0) {
    return "Last week's data: none -- this is the user's first weekly session (or last week had nothing planned). Skip Stage 1 entirely and open directly with Stage 2 for the first role listed below.";
  }

  const lines = lastWeek.items.map((item) => {
    const status =
      item.type === "project"
        ? item.percent === null
          ? "no progress recorded"
          : `${item.percent}% complete`
        : item.done
          ? "done"
          : "not done";
    return `- [${item.role}] (${item.type}) "${item.title}" -- ${status}`;
  });

  return `Last week's data (week of ${lastWeek.weekStart}):\n${lines.join("\n")}\n\nOngoing Projects in that list keep their title this week if they roll over. A this-week slice of one of those Projects is a Goal, not a second Project.`;
}

// Renders whatever the caller already had locked in earlier this same
// round (see WeeklySessionInput.lockedActions) as its own labeled section,
// so the model has an explicit, authoritative list to check against instead
// of only its own read of the transcript -- the actual fix for items
// silently flipping role/type turn to turn (see the "actions" field
// instruction in both prompts above, which points back at this heading).
function formatLockedActions(lockedActions: ClassifiedAction[]): string {
  if (lockedActions.length === 0) return "";

  const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const lines = lockedActions.map((a) => {
    const bits: string[] = [a.type];
    if (a.cadenceCount) bits.push(`${a.cadenceCount}x`);
    if (a.weekday !== undefined) bits.push(WEEKDAY_NAMES[a.weekday]);
    if (a.preferredTime) bits.push(a.preferredTime);
    if (a.durationMinutes) bits.push(`${a.durationMinutes}min`);
    if (a.recurrence) {
      const r = a.recurrence;
      if (r.pattern === "daily") bits.push("repeats daily");
      else if (r.pattern === "weekdays") bits.push("repeats weekdays");
      else if (r.pattern === "weekly" && r.days?.length) {
        bits.push(`repeats ${r.days.join("/")}`);
      }
    }
    return `- [${a.role}] "${a.description}" (${bits.join(", ")})`;
  });

  return `\n\n## Already locked in this round\n\n${lines.join("\n")}`;
}

// Two blocks, not one concatenated string -- caching is a strict prefix
// match, so the per-session dynamic tail (roles + last week's data, which
// differ by user and change week to week) has to live *after* the cache
// breakpoint as its own block. Put it on the static block instead and the
// dynamic tail would bust the cache for every user, every session -- the
// one thing actually worth caching here is the several-hundred-line static
// instruction block above, which is byte-identical across every turn, every
// session, every user. Full and addendum mode each get their own static
// block (and therefore their own cache entry) -- they're different prompts,
// not a shared one with a mode flag spliced in.
function buildSystemBlocks(
  mode: WeeklySessionMode,
  roles: string[],
  lastWeek: LastWeekContext | null | undefined,
  lockedActions: ClassifiedAction[],
  weekLabel?: string,
  weekStart?: string,
  calendarSummary?: string,
  timeZone?: string,
): Anthropic.TextBlockParam[] {
  const weekLine = weekLabel
    ? `You are planning **${weekLabel}**${weekStart ? ` (Sunday ${weekStart} through the following Saturday)` : ""}. Whenever you say "this week", you mean that exact range — not last week, and not leftover days of a week that's already almost over.\n\n`
    : "";

  // Bug fix: without knowing what "today" actually is, "tonight"/"today"/
  // "tomorrow" had nothing to resolve against, so `weekday` (see
  // ClassifiedAction and the rules above) couldn't be set for them --
  // "Budgeting with Brooklyn tonight" landed with no day preference at
  // all. Computed in the user's real zone (falls back to the server's own
  // if the caller hasn't threaded one through yet) so "today" actually
  // matches the day the user is looking at, not whatever the server's
  // clock reads.
  const now = DateTime.now().setZone(timeZone ?? "local");
  const todayLine = `Today is **${now.toFormat("cccc, LLLL d")}**. Resolve "today"/"tonight"/"tomorrow"/"this morning" against this exact date when setting \`weekday\`.\n\n`;

  // Falls back to an explicit "not available" line rather than omitting
  // the section outright -- see calendarSummary.ts's CALENDAR_UNAVAILABLE_SUMMARY.
  // An omitted section reads to the model as "no info either way," which is
  // exactly the ambiguity that let it fall back to a vague "I don't have a
  // view of your calendar" instead of stating the real reason.
  const calendarLine = `${calendarSummary ?? "This week's real Google Calendar: not available right now."}\n\n`;

  if (mode === "addendum") {
    const dynamic = `## This round's actual data

${todayLine}${weekLine}${calendarLine}Roles on file for this user, exactly as they must appear in \`role\` (the last one, "Personal", is the engine's own reserved catch-all -- see the rule above): ${roles.map((r) => `"${r}"`).join(", ")}${formatLockedActions(lockedActions)}`;

    return [
      { type: "text", text: ADDENDUM_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
      { type: "text", text: dynamic },
    ];
  }

  const dynamic = `## This session's actual data

${todayLine}${weekLine}${calendarLine}Roles this week, in the exact order to run Stage 2+3 (the last one, "Personal", is the engine's own reserved catch-all -- see the rule above, not one of the user's declared roles): ${roles.map((r) => `"${r}"`).join(", ")}

${formatLastWeek(lastWeek)}${formatLockedActions(lockedActions)}`;

  return [
    { type: "text", text: FULL_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
    { type: "text", text: dynamic },
  ];
}

function buildTool(mode: WeeklySessionMode): Anthropic.Tool {
  return {
    name: "weekly_session_turn",
    description:
      "Report the next thing to say to the user and the current state of the weekly planning session.",
    input_schema: {
      type: "object",
      properties: {
        reply: { type: "string", description: "What to say back to the user next." },
        done: {
          type: "boolean",
          description:
            mode === "addendum"
              ? "True only once at least one action item is fully captured this round and the user has signaled there's nothing else to add right now. False on every other turn."
              : "True only once every role has an action-item outcome (captured or explicitly skipped) and Stage 1 is fully resolved.",
        },
        actions: {
          type: "array",
          description:
            mode === "addendum"
              ? "The full, current list of every classified action item captured so far this round."
              : "The full, current list of every classified action item captured so far, across all roles.",
          items: {
            type: "object",
            properties: {
              role: { type: "string" },
              description: {
                type: "string",
                description:
                  "The action itself -- never restates the day of week or clock time (those go in `weekday`/`preferredTime`, and the calendar block will show them once placed). Keep any name the user actually said.",
              },
              type: { type: "string", enum: ["habit", "goal", "project"] },
              cadenceCount: {
                type: "integer",
                description: "Habit only. Omit for Goal (treated as 1) and Project (no calendar block).",
              },
              preferredTime: {
                type: "string",
                description:
                  "Habit/Goal only, \"HH:MM\" 24-hour local time the user actually stated -- never inferred or guessed from a day-part like \"afternoon\"/\"morning\"/\"evening\". Omit for Project. Omit for Habit/Goal if the user hasn't given a real clock time yet (including when this turn's reply is the question asking for one), or if they were asked and genuinely have no preference.",
              },
              durationMinutes: {
                type: "integer",
                minimum: 5,
                maximum: 1440,
                description:
                  "Habit/Goal only, integer minutes -- the length of the calendar block the user actually stated (\"1 hour\" -> 60, \"half an hour\" -> 30, \"6-8pm\" -> 120). Never inferred or guessed. Omit for Project. Omit for Habit/Goal if the user hasn't given a duration yet (including when this turn's reply is the question asking for one), or if they were asked and genuinely have no preference. For a multi-block Habit, this same duration applies to every block.",
              },
              weekday: {
                type: "integer",
                minimum: 0,
                maximum: 6,
                description:
                  "Habit/Goal only, 0=Sunday..6=Saturday. Set when the user named ONE specific day, including a relative word (\"today\", \"tonight\", \"tomorrow\") resolved against the real current date given above. Omit for a multi-day cadence (\"every day\", \"Monday through Friday\" -- that's `cadenceCount`, not a single weekday) or when the user simply didn't name a day. Omit for Project.",
              },
              recurrence: {
                type: "object",
                description:
                  "Habit only, and only when the user actually asked for this item to keep going beyond this week -- see the SHARED_ITEM_RULES \"repeat beyond this week?\" follow-up. Omit for Goal, Project, one-week-only Habits, and when this turn's reply is the question asking about recurrence.",
                properties: {
                  pattern: {
                    type: "string",
                    enum: ["daily", "weekly", "weekdays"],
                    description:
                      "\"daily\" = every day. \"weekdays\" = Mon-Fri. \"weekly\" = specific days of the week (see `days` below). Anything the user asks for outside these three is not supported this round; either narrow the answer or omit `recurrence`.",
                  },
                  days: {
                    type: "array",
                    items: {
                      type: "string",
                      enum: ["MO", "TU", "WE", "TH", "FR", "SA", "SU"],
                    },
                    description:
                      "Required when pattern is \"weekly\" -- two-letter Google Calendar weekday codes in ascending week order (MO, TU, WE, TH, FR, SA, SU). Omit for \"daily\" and \"weekdays\", which don't need it.",
                  },
                },
                required: ["pattern"],
                additionalProperties: false,
              },
            },
            required: ["role", "description", "type"],
            additionalProperties: false,
          },
        },
      },
      required: ["reply", "done", "actions"],
      additionalProperties: false,
    },
  };
}

type ToolInput = {
  reply: string;
  done: boolean;
  actions: ClassifiedAction[];
};

export async function processWeeklySessionMessage(
  input: WeeklySessionInput,
): Promise<WeeklySessionOutput> {
  const mode: WeeklySessionMode = input.mode ?? "full";
  const state: ConversationState = input.state ?? { turns: [] };
  const message = input.message.trim();
  // Every session includes the reserved "Personal" role, no matter what the
  // caller passed in -- see withPersonalRole and the Classification section
  // of both prompts above.
  const roles = withPersonalRole(input.roles);
  const lockedActions = input.lockedActions ?? [];

  const turnsWithUserMessage = message
    ? [...state.turns, { role: "user" as const, content: message }]
    : state.turns;

  // Second cache breakpoint, on the last message's content block: caches
  // the growing conversation prefix itself, not just the system prompt.
  // Each turn appends one new message and re-marks the (now-different)
  // last block -- the next turn's request reads everything up through the
  // previous breakpoint from cache and only pays full price for what's
  // actually new. Matters here specifically because a real session runs
  // many turns (Stage 1 + a SMART drill-down per role), so the resent
  // prefix keeps growing turn over turn without this.
  const messages =
    turnsWithUserMessage.length > 0
      ? turnsWithUserMessage.map((t, i) => ({
          role: t.role,
          content:
            i === turnsWithUserMessage.length - 1
              ? [
                  {
                    type: "text" as const,
                    text: t.content,
                    cache_control: { type: "ephemeral" as const },
                  },
                ]
              : t.content,
        }))
      : [{ role: "user" as const, content: "(start the session)" }];

  const weekSuffix = input.weekStart ? `weekly:${input.weekStart}` : "weekly";
  const response = await createTracedMessage(
    {
      model: MODEL,
      max_tokens: 1536,
      thinking: { type: "disabled" },
      system: buildSystemBlocks(
        mode,
        roles,
        input.lastWeek,
        lockedActions,
        input.weekLabel,
        input.weekStart,
        input.calendarSummary,
        input.timeZone,
      ),
      tools: [buildTool(mode)],
      tool_choice: { type: "tool", name: "weekly_session_turn" },
      messages,
    },
    {
      distinctId: input.userId,
      sessionId: llmSessionId(input.userId, `${weekSuffix}:${mode}`),
      spanName: mode === "addendum" ? "weekly-session-addendum" : "weekly-session",
    },
  );

  const toolUse = response.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === "tool_use",
  );
  if (!toolUse) {
    throw new Error(
      "Engine bug: model did not call weekly_session_turn despite forced tool_choice",
    );
  }
  const result = toolUse.input as ToolInput;

  const actions = stabilizeActions({
    locked: lockedActions,
    incoming: Array.isArray(result.actions) ? result.actions : [],
    roles,
    lastWeekItems: input.lastWeek?.items,
    reply: result.reply,
  });

  const nextState: ConversationState = {
    turns: [...turnsWithUserMessage, { role: "assistant", content: result.reply }],
  };

  return {
    reply: result.reply,
    state: nextState,
    action: result.done ? { type: "complete", actions } : { type: "ask" },
    actionsSoFar: actions,
    usage: {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      cacheCreationInputTokens: response.usage.cache_creation_input_tokens ?? 0,
      cacheReadInputTokens: response.usage.cache_read_input_tokens ?? 0,
    },
  };
}
