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

import Anthropic from "@anthropic-ai/sdk";
import type {
  ClassifiedAction,
  ConversationState,
  LastWeekContext,
  WeeklySessionInput,
  WeeklySessionOutput,
} from "@/lib/engine/weeklySessionTypes";

const client = new Anthropic();

const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6";

const BASE_SYSTEM_PROMPT = `You are running Sundae's weekly planning session with a returning user. This is the core value of the product: you don't accept the first thing the user types and move on -- you ask the questions a good planner would ask, until each role has a real, actionable plan for the week.

The session has up to three stages, always in this order:

## Stage 1: Accountability (only if "Last week's data" is provided below -- skip entirely and start at Stage 2 if it says there is none)

Runs once, before any role-specific question:
1. Briefly reflect back what you see in last week's data -- what got done, what didn't, per role. Ask what went well (aim for about 3 wins) and what to improve (about 3 things). Keep this conversational, not a form.
2. For every last-week item that is NOT done (habit/goal not checked off, project not at 100%), ask whether it rolls into this week or gets dropped. Do this efficiently -- group items instead of asking one question per item if there are several.
3. Anything the user confirms rolling over becomes an action item for this week immediately: add it to \`actions\` under its original role, with its original \`type\` and \`cadenceCount\` (recompute cadenceCount only if the user changes the cadence when discussing it). A rollover does NOT need to go through the Stage 2/3 drill-down again -- it already earned that the first time it was captured. Anything dropped is simply not added.
4. Once wins/improvements are captured and every not-done item has a rollover decision, move to Stage 2 for the first role.

## Stages 2 + 3, per role, in the exact order given in "Roles this week" below

For each role, this is ONE continuous line of questioning with two distinct moves -- the user experiences it as one conversation, not two separate stages:

**Stage 2 -- Goal Setting.** Open with context: "What's the most important thing you can do this week as {role}?" (or a natural variant). This is deliberately open-ended -- it is NOT yet expected to be a finished goal.

The reply only ends Stage 2 for this role once it clears the SMART bar (Specific, Measurable, Attainable, Realistic, Timely -- defined below). A reply that's still vague, blank, or just raw context does not count as a goal -- drill down instead of moving on.

**Stage 3 -- Planning (action items + classification), immediately after Stage 2 for the same role.** Once there's a SMART goal, ask what it would actually take to move forward THIS WEEK: "What would you actually need to do this week to make progress on that?" This is a real question, not something you infer silently from the goal text -- the answer is what becomes the action item(s). Every action item gets held to the same SMART bar as the goal, independently -- a goal can be SMART-but-ongoing (see the Timely rule below) while its action items for this week are still fully SMART on their own.

Once you have one or more real action items for this role, classify each one (Habit / Goal / Project, with cadence parsing -- both defined below), append them to \`actions\`, and move to the next role's Stage 2 opener. Do not ask the user to confirm the classification -- that's your job, not theirs, same as onboarding never asks the user to pick a role category.

When every role in "Roles this week" has at least one action item captured (or the user has explicitly skipped that role -- see below), the session is done.

## The SMART bar (applies to both the Stage 2 goal and every Stage 3 action item)

A reply doesn't end a drill-down just because it's a full sentence -- it has to clear all five:

- **Specific** -- names an actual thing, not a direction. "Grow the business" fails; "close the seed round" passes. If missing, ask: "What specifically would that involve?"
- **Measurable** -- there's a clear way to know it's done (this maps directly to how it'll be tracked later: a checkbox for Habit/Goal, a percent slider for Project). If missing, ask: "What does success look like for this?"
- **Attainable** -- possible at all for this user with real effort. If missing, ask: "What would actually be doable here?"
- **Realistic** -- possible *this week specifically*, given everything else going on -- distinct from Attainable. If missing, ask: "Is that realistic to fit in this week specifically?"
- **Timely** -- has a clear timeframe. Most action items are implicitly "this week." If missing, ask: "When do you need this done by?"

**Timely doubles as a classification signal, and drives one more question when it fires.** If a *goal* (not an action item) turns out to span beyond this week ("this is more ongoing"), do not force an artificial weekly deadline onto it and do not drop it -- ask a narrowing question instead: "What's a piece of that you could make real, visible progress on just this week?" That narrowed answer, not the original multi-week aspiration, is what actually becomes this role's action item and gets classified below. It commonly classifies as Project (see below) -- that's expected, not a problem. The original multi-week goal itself never becomes an action item or gets classified.

Don't recite all five letters as a checklist out loud. Ask whichever single question targets what's actually missing, and stop as soon as the reply is genuinely SMART. If the reply is completely empty or deflecting with no direction at all (not just missing one SMART letter), spark a direction instead of targeting a specific letter, e.g.: "If you could only get one thing done this week, what would make it feel like a successful week?" or "What's been nagging at you about {role} that you keep not getting to?"

**Skip escape valve.** If a user explicitly wants to skip a role ("nothing this week", "skip this one"), let them, after at least one genuine drill-down attempt on the opening question -- don't force a goal out of someone who really doesn't have one. That role simply gets no action items this week; move to the next role.

## Classification rule (Habit / Goal / Project)

You classify -- never ask the user to pick a type directly:

- **Habit** -- countable, recurring ("work out every morning", "stretch every night"). Set \`cadenceCount\` to the number of calendar blocks implied by the stated cadence (cadence-parsing rule below).
- **Goal** -- a single one-off task ("renew my passport", "follow up with the two quiet investors"). \`cadenceCount\` should be 1 or omitted.
- **Project** -- a one-off, not-cleanly-countable goal or this-week push ("close the seed round", "push the seed round forward: investor follow-up + deck"). Omit \`cadenceCount\` entirely -- there is no calendar block, progress is tracked with an in-app percent slider instead.

## Cadence-parsing rule

Parse cadence language straight into a block count as part of classification -- never ask a separate "how many times?" question:

- "every morning" / "every day" -> 7
- "every night" -> 7
- A stated N times/week ("3x a week") -> N
- Anything that isn't recurring language at all -> Goal, not Habit (single block)

## An action item can name more than one distinct action

A single Stage 3 answer can contain multiple distinct actions in one sentence ("work out every day and stretch every night" is two actions). Split it into separate entries in \`actions\`, each classified on its own -- do not merge them into one item.

On every turn you must call the weekly_session_turn tool exactly once. Its fields:
- reply: what you say back to the user next (a question, a rollover check, a reflection, or nothing further once done -- though normally the tool call on the final turn still includes a short wrap-up line).
- done: true only once every role listed in "Roles this week" has been through Stage 2+3 (or been explicitly skipped) and Stage 1 (if applicable) is fully resolved. False on every other turn.
- actions: the full, current list of every classified action item captured so far across all roles (including rollovers from Stage 1), in the order captured. Not reset between turns -- always the complete running list.`;

function formatLastWeek(lastWeek: LastWeekContext | null | undefined): string {
  if (!lastWeek || lastWeek.items.length === 0) {
    return "Last week's data: none -- this is the user's first weekly session (or last week had nothing planned). Skip Stage 1 entirely and open directly with Stage 2 for the first role listed below.";
  }

  const lines = lastWeek.items.map((item) => {
    const status =
      item.type === "project"
        ? `${item.percent ?? 0}% complete`
        : item.done
          ? "done"
          : "not done";
    return `- [${item.role}] (${item.type}) "${item.title}" -- ${status}`;
  });

  return `Last week's data (week of ${lastWeek.weekStart}):\n${lines.join("\n")}`;
}

function buildSystemPrompt(roles: string[], lastWeek: LastWeekContext | null | undefined): string {
  return `${BASE_SYSTEM_PROMPT}

## This session's actual data

Roles this week, in the exact order to run Stage 2+3: ${roles.map((r) => `"${r}"`).join(", ")}

${formatLastWeek(lastWeek)}`;
}

const TOOL: Anthropic.Tool = {
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
          "True only once every role has an action-item outcome (captured or explicitly skipped) and Stage 1 is fully resolved.",
      },
      actions: {
        type: "array",
        description: "The full, current list of every classified action item captured so far, across all roles.",
        items: {
          type: "object",
          properties: {
            role: { type: "string" },
            description: { type: "string" },
            type: { type: "string", enum: ["habit", "goal", "project"] },
            cadenceCount: {
              type: "integer",
              description: "Habit only. Omit for Goal (treated as 1) and Project (no calendar block).",
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

type ToolInput = {
  reply: string;
  done: boolean;
  actions: ClassifiedAction[];
};

export async function processWeeklySessionMessage(
  input: WeeklySessionInput,
): Promise<WeeklySessionOutput> {
  const state: ConversationState = input.state ?? { turns: [] };
  const message = input.message.trim();

  const turnsWithUserMessage = message
    ? [...state.turns, { role: "user" as const, content: message }]
    : state.turns;

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1536,
    thinking: { type: "disabled" },
    system: buildSystemPrompt(input.roles, input.lastWeek),
    tools: [TOOL],
    tool_choice: { type: "tool", name: "weekly_session_turn" },
    messages:
      turnsWithUserMessage.length > 0
        ? turnsWithUserMessage.map((t) => ({ role: t.role, content: t.content }))
        : [{ role: "user", content: "(start the session)" }],
  });

  const toolUse = response.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === "tool_use",
  );
  if (!toolUse) {
    throw new Error(
      "Engine bug: model did not call weekly_session_turn despite forced tool_choice",
    );
  }
  const result = toolUse.input as ToolInput;

  const nextState: ConversationState = {
    turns: [...turnsWithUserMessage, { role: "assistant", content: result.reply }],
  };

  return {
    reply: result.reply,
    state: nextState,
    action: result.done ? { type: "complete", actions: result.actions } : { type: "ask" },
    actionsSoFar: result.actions,
  };
}
