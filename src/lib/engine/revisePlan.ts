// Plan-revision engine (Day 7 confirm-screen redesign).
//
// The weekly session ends with a deterministic block proposal (see
// src/lib/planning/blocks.ts), and until now the confirm screen was
// take-it-or-leave-it: the only control was "Confirm & write to calendar".
// This lets the user talk to Sundae about the proposed plan instead --
// "move the temple shift to Saturday", "drop the date night", "make running
// 3x a week not every day", "add a block for meal prep on Sunday".
//
// Same channel-agnostic shape as the other engines (engine.ts,
// weeklySession.ts): it takes the current classified action list plus the
// user's request and returns the revised list plus a short reply. It does
// NOT place calendar blocks -- the caller re-runs the normal proposal step
// on the returned actions, so all the scheduling rules (one-habit-block-per
// -day, honoring a named weekday) stay in exactly one place.

import Anthropic from "@anthropic-ai/sdk";
import type { ClassifiedAction } from "@/lib/engine/weeklySessionTypes";

const client = new Anthropic();

const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6";

const SYSTEM_PROMPT = `You are helping a user adjust their already-drafted weekly plan on Sundae's confirmation screen. You are given the current list of planned action items and one change the user is asking for. Return the FULL updated list with that change applied, leaving everything the user did not ask to change exactly as it was.

Each action item has:
- role: which of the user's roles it belongs to (keep items under the role they were already under unless the user explicitly moves one).
- description: a short phrase naming the action.
- type: "habit", "goal", or "project".
- cadenceCount: for a habit, how many times that week (7 = every day, 3 = three times a week, etc). Omit for goal and project.
- preferredTime: for a habit or goal, "HH:MM" 24-hour local time -- the specific clock time that item is anchored to. Omit for project (no calendar block) and for any habit/goal that genuinely has no time preference.

Rules:
- Classify exactly the way the planning session does -- you decide type, never ask the user to pick it:
  - Habit = countable, recurring ("run every day", "stretch 3x a week"). Set cadenceCount from the cadence.
  - Goal = a single one-off task ("accept the job offer", "renew passport"). No cadenceCount.
  - Project = a one-off, not-cleanly-countable push ("close the seed round"). No cadenceCount, no calendar block.
- If the user ties an item to a specific day of the week -- "date night on Tuesday", "temple shift on Saturday", "Sunday meal prep" -- INCLUDE that weekday name in the item's description text. Scheduling reads the day out of the description, so the weekday must be in the words, e.g. description "Plan date night on Tuesday".
- If the user's request names or changes a clock time ("move the run to 6am", "make date night 7:30 instead") -- update that item's preferredTime to match ("06:00", "19:30"). Leave every other item's preferredTime exactly as it was.
- Adding, removing, renaming, reclassifying, changing a cadence, changing a time, or moving an item to a different day are all fair game. Apply exactly what was asked -- don't invent extra changes.
- If the request is unclear or you can't tell which item it refers to, make your best single interpretation and say what you did in the reply, so the user can correct you if you guessed wrong.

On every turn call the revise_plan tool exactly once:
- reply: one short, friendly sentence telling the user what you changed (or, if nothing needed changing, saying so).
- actions: the full updated action list, in a sensible order (group by role).`;

const TOOL: Anthropic.Tool = {
  name: "revise_plan",
  description: "Return the revised full plan and a short note on what changed.",
  input_schema: {
    type: "object",
    properties: {
      reply: { type: "string", description: "One short sentence on what changed." },
      actions: {
        type: "array",
        description: "The full, updated list of classified action items.",
        items: {
          type: "object",
          properties: {
            role: { type: "string" },
            description: { type: "string" },
            type: { type: "string", enum: ["habit", "goal", "project"] },
            cadenceCount: {
              type: "integer",
              description: "Habit only. Omit for Goal and Project.",
            },
            preferredTime: {
              type: "string",
              description:
                "Habit/Goal only, \"HH:MM\" 24-hour local time. Omit for Project and for any item with no time preference.",
            },
          },
          required: ["role", "description", "type"],
          additionalProperties: false,
        },
      },
    },
    required: ["reply", "actions"],
    additionalProperties: false,
  },
};

type ToolInput = {
  reply: string;
  actions: ClassifiedAction[];
};

export type RevisePlanInput = {
  actions: ClassifiedAction[];
  message: string;
};

export type RevisePlanOutput = {
  reply: string;
  actions: ClassifiedAction[];
};

export async function revisePlan(input: RevisePlanInput): Promise<RevisePlanOutput> {
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1536,
    thinking: { type: "disabled" },
    system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
    tools: [TOOL],
    tool_choice: { type: "tool", name: "revise_plan" },
    messages: [
      {
        role: "user",
        content: `Current plan:\n${JSON.stringify(input.actions, null, 2)}\n\nRequested change:\n${input.message}`,
      },
    ],
  });

  const toolUse = response.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === "tool_use",
  );
  if (!toolUse) {
    throw new Error("Engine bug: model did not call revise_plan despite forced tool_choice");
  }
  const result = toolUse.input as ToolInput;

  return { reply: result.reply, actions: result.actions };
}
