// Planning engine — onboarding stage.
//
// Channel-agnostic per the MVP spec: `processMessage` takes a user message
// plus the current conversation state and returns the next question/action.
// The caller (web UI today, SMS/voice later) decides how to send `reply` to
// the user and where to store `state`.
//
// Day 6/7 shipped this as a hand-rolled regex/keyword state machine. It
// broke immediately on real conversational input -- "day to day" (an echo
// of the question's own wording) got parsed as a role, and "no" (declining
// to edit the role list) got parsed as a replacement role list, both
// because the old engine pattern-matched keywords instead of understanding
// what was said. This version replaces that parsing layer with an actual
// Claude call: the model reads the real conversation and decides what's
// been established, what's still open, and what to ask next. The engine's
// outward contract (message + state in, reply + state + action out) is
// unchanged -- only what happens inside `processMessage` is different.

import Anthropic from "@anthropic-ai/sdk";
import {
  type ConversationState,
  type EngineInput,
  type EngineOutput,
  type RoleAnswer,
  initialConversationState,
} from "@/lib/engine/types";

const client = new Anthropic();

const SYSTEM_PROMPT = `You are running Sundae's onboarding conversation with a new user. Your job is to actually understand what they say, not pattern-match keywords -- this replaces an earlier version of this engine that broke on ordinary phrasing (treating a stray word as a role name, treating "no" as a new answer instead of a decline).

The flow, in order:

1. Ask what roles/hats the person wears day to day (e.g. "Founder", "Husband", "Athlete"). They may list several in one message, in a full sentence, with filler words -- extract only the actual roles, not the sentence structure around them ("I am a", "and", "day to day" when it's just echoing the question, etc).
2. Read the list back and ask if anything should be added, cut, or renamed. A plain decline ("no", "looks good", "that's it") means proceed with the list as-is -- it is NOT a replacement role list.
3. For each role, in the order given, ask (a) the 2-3 things that matter most to them right now for that role (big-picture, not this week's tasks), and (b) anything already on their calendar or in motion for that role that these should work around (optional -- a blank or "no" answer is fine). Then read back a short summary for that one role and confirm before moving to the next.
4. Once every role has been through step 3, give a full summary across all roles and ask if they're ready to lock it in.
5. Only mark the conversation done once the user has explicitly confirmed that final full summary -- not a per-role confirmation, the final one.

Rules for actually understanding the user, not just parsing their words:
- If someone corrects you, is telling you that something you inferred is wrong, or is clarifying rather than answering the literal question you just asked, apply the correction and continue naturally -- do not record their correction as if it were a literal answer to your last question.
- If what they say is genuinely ambiguous, ask a short clarifying question rather than guessing.
- Keep your own replies short and conversational -- one question or confirmation at a time, no bullet-point interrogations.
- Never invent a role, goal, or piece of context the user didn't actually say.

On every turn you must call the onboarding_turn tool exactly once. Its fields:
- reply: what you say back to the user next (a question, a confirmation, or the final locked-in message).
- done: true only on the turn where the user has just confirmed the final full summary. False on every other turn, including per-role confirmations.
- roles: the full, current list of roles as the user has settled on them so far (not necessarily final until done is true).
- answers: one entry per role that has actually been asked about so far, each with the role name, the goal strings captured for it (as separate strings, not one blob), and free-text context (empty string if none given). Roles not yet reached should not appear here.`;

const TOOL: Anthropic.Tool = {
  name: "onboarding_turn",
  description:
    "Report the next thing to say to the user and the current state of the onboarding conversation.",
  input_schema: {
    type: "object",
    properties: {
      reply: { type: "string", description: "What to say back to the user next." },
      done: {
        type: "boolean",
        description: "True only once the user has confirmed the final full summary.",
      },
      roles: {
        type: "array",
        items: { type: "string" },
        description: "The full current role list.",
      },
      answers: {
        type: "array",
        items: {
          type: "object",
          properties: {
            role: { type: "string" },
            goals: { type: "array", items: { type: "string" } },
            context: { type: "string" },
          },
          required: ["role", "goals", "context"],
          additionalProperties: false,
        },
      },
    },
    required: ["reply", "done", "roles", "answers"],
    additionalProperties: false,
  },
  strict: true,
};

type ToolInput = {
  reply: string;
  done: boolean;
  roles: string[];
  answers: RoleAnswer[];
};

export async function processMessage(input: EngineInput): Promise<EngineOutput> {
  const state = input.state ?? initialConversationState;
  const message = input.message.trim();

  // First call of a fresh conversation has no user message yet -- just get
  // the opening question rather than sending an empty turn to the model.
  const turnsWithUserMessage = message
    ? [...state.turns, { role: "user" as const, content: message }]
    : state.turns;

  const response = await client.messages.create({
    model: "claude-opus-5",
    max_tokens: 1024,
    thinking: { type: "disabled" },
    system: SYSTEM_PROMPT,
    tools: [TOOL],
    tool_choice: { type: "tool", name: "onboarding_turn" },
    messages:
      turnsWithUserMessage.length > 0
        ? turnsWithUserMessage.map((t) => ({ role: t.role, content: t.content }))
        : [{ role: "user", content: "(start the conversation)" }],
  });

  const toolUse = response.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === "tool_use",
  );
  if (!toolUse) {
    throw new Error("Engine bug: model did not call onboarding_turn despite forced tool_choice");
  }
  const result = toolUse.input as ToolInput;

  const nextState: ConversationState = {
    turns: [
      ...turnsWithUserMessage,
      { role: "assistant", content: result.reply },
    ],
  };

  return {
    reply: result.reply,
    state: nextState,
    action: result.done
      ? { type: "complete", roles: result.roles, answers: result.answers }
      : { type: "ask" },
  };
}
