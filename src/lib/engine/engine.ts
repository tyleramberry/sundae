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

import type Anthropic from "@anthropic-ai/sdk";
import { getAnthropicModel } from "@/lib/anthropic/model";
import { createTracedMessage, llmSessionId } from "@/lib/anthropic/traced";
import {
  type ConversationState,
  type EngineInput,
  type EngineOutput,
  type RoleAnswer,
  initialConversationState,
} from "@/lib/engine/types";

const MODEL = getAnthropicModel();

const SYSTEM_PROMPT = `You are running Sundae's onboarding conversation with a new user. Your job is to actually understand what they say, not pattern-match keywords -- this replaces an earlier version of this engine that broke on ordinary phrasing (treating a stray word as a role name, treating "no" as a new answer instead of a decline).

The flow, in order:

1. Ask what roles/hats the person wears day to day (e.g. "Founder", "Husband", "Athlete"). They may list several in one message, in a full sentence, with filler words -- extract only the actual roles, not the sentence structure around them ("I am a", "and", "day to day" when it's just echoing the question, etc).
2. Read the list back once and ask if anything should be added, cut, or renamed. A plain decline ("no", "looks good", "that's it") means proceed with the list as-is -- it is NOT a replacement role list.
3. For each role, in the order given, ask the 2-3 things that matter most to them right now for that role (big-picture, not this week's tasks). Accept whatever they give you and move straight to the next role's question. Do NOT read back a per-role summary or ask "sound right?" after each individual role -- that loop is intentionally gone, it made the flow feel like an interrogation. Do NOT ask what's already on their calendar or in motion for a role, either: Sundae reads the user's Google Calendar directly (a separate feature, already built) specifically so the person never has to describe their own calendar back to the app. Asking would be redundant and undercut the product's whole pitch.
4. Once every role has been asked about, give ONE full summary across every role and ask if it's right, or if there's a role name or a goal they'd like to change. This is the only confirmation step in the entire conversation.
5. If they ask to change something at that point, apply the edit, show the updated full summary again, and ask again if it's right. Keep looping this step -- editing, re-showing, re-asking -- for as many rounds as they want.
6. Only mark the conversation done on the turn where they explicitly confirm the full summary with nothing left to change.

Rules for actually understanding the user, not just parsing their words:
- If someone corrects you, is telling you that something you inferred is wrong, or is clarifying rather than answering the literal question you just asked, apply the correction and continue naturally -- do not record their correction as if it were a literal answer to your last question.
- If what they say is genuinely ambiguous, ask a short clarifying question rather than guessing.
- Keep your own replies short and conversational -- one question or confirmation at a time, no bullet-point interrogations.
- Never invent a role, goal, or piece of context the user didn't actually say.

On every turn you must call the onboarding_turn tool exactly once. Its fields:
- reply: what you say back to the user next (a question, the one final summary/confirmation, an edit acknowledgment, or the final locked-in message).
- done: true only on the turn where the user has just confirmed the final full summary with nothing left to change. False on every other turn -- there is no per-role "done".
- roles: the full, current list of roles as the user has settled on them so far (not necessarily final until done is true).
- answers: one entry per role that has actually been asked about so far, each with the role name and the goal strings captured for it (as separate strings, not one blob). Roles not yet reached should not appear here. Leave context as an empty string unless the user volunteers something calendar-related completely unprompted -- never ask for it.`;

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
        description:
          "True only once the user has confirmed the final full summary with nothing left to edit. There is no per-role confirmation step.",
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
            context: {
              type: "string",
              description:
                "Leave empty. Sundae reads the calendar directly -- never ask for this.",
            },
          },
          required: ["role", "goals", "context"],
          additionalProperties: false,
        },
      },
    },
    required: ["reply", "done", "roles", "answers"],
    additionalProperties: false,
  },
  // `strict: true` (hard schema-validation guarantee) is only documented as
  // supported on a specific model list that doesn't include Sonnet 4.6 --
  // omitted here so this works on whichever model MODEL points at. Forced
  // tool_choice below still guarantees the tool gets called; the schema
  // itself (required fields, additionalProperties: false) still guides the
  // model even without the hard strict-mode guarantee.
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

  const response = await createTracedMessage(
    {
      model: MODEL,
      max_tokens: 1024,
      thinking: { type: "disabled" },
      // Fully static, byte-identical across every onboarding turn for every
      // user -- a straightforward cache breakpoint, same win as
      // weeklySession.ts's system prompt (see that file for the version with
      // per-session dynamic content that has to stay out of the cached block).
      system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
      tools: [TOOL],
      tool_choice: { type: "tool", name: "onboarding_turn" },
      messages:
        turnsWithUserMessage.length > 0
          ? turnsWithUserMessage.map((t) => ({ role: t.role, content: t.content }))
          : [{ role: "user", content: "(start the conversation)" }],
    },
    {
      distinctId: input.userId,
      sessionId: llmSessionId(input.userId, "onboarding"),
      spanName: "onboarding",
    },
  );

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
