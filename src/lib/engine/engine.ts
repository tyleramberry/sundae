// Planning engine — onboarding stage.
//
// Channel-agnostic per the MVP spec: `processMessage` takes a user message
// plus the current conversation state and returns the next question/action.
// No I/O happens in here. The caller (web UI today, SMS/voice later)
// decides how to send `reply` to the user and where to store `state`.
//
// Implements the question tree drafted in docs/onboarding-flow.md.
// The weekly-session stage (post-onboarding) is out of scope for Day 6.

import {
  type ConversationState,
  type EngineInput,
  type EngineOutput,
  type RoleAnswers,
  initialConversationState,
} from "@/lib/engine/types";

const AFFIRMATIVE = /^(y|yes|yeah|yep|correct|right|good|looks good|sounds good|lock it in|confirm)\b/i;
const NEGATIVE = /^(n|no|nope|not quite|change|edit)\b/i;
// Distinct from NEGATIVE above: at roles_confirm the question is "anything to
// add/cut/rename?", so a plain decline ("no", "nothing", "looks good") means
// *proceed with the current list* -- it must NOT fall through to "treat this
// message as a replacement role list" the way any other reply does. NEGATIVE
// isn't reused here because it also matches "change"/"edit", which at this
// prompt mean the opposite (the user does want to revise the list).
const DECLINE_TO_EDIT =
  /^(n|no|nope|none|nothing|all good|looks good|good to go|that'?s (?:it|all|fine|good))\b/i;

// Strips conversational lead-ins off the front of a single item -- someone
// answering "what are your roles?" in a full sentence ("I am a founder, a
// husband, and an athlete") shouldn't end up with "I am a founder" as one
// role and "a husband" / "an athlete" as the others just because only the
// first item carried "I am". Applied per item (post-split), not once on the
// whole message, since every item can carry its own leading article.
const FILLER_PREFIX = /^(?:i\s*['’]?m|i\s+am)\s+/i;
const LEADING_ARTICLE = /^(?:an?|the)\s+/i;

function splitList(message: string): string[] {
  return message
    .split(/[,\n]|(?:\band\b)/i)
    .map((s) =>
      s.trim().replace(FILLER_PREFIX, "").replace(LEADING_ARTICLE, "").trim(),
    )
    .filter(Boolean);
}

function currentRole(state: ConversationState): string {
  const role = state.roles[state.currentRoleIndex];
  if (!role) {
    throw new Error("Engine bug: no current role at index " + state.currentRoleIndex);
  }
  return role;
}

function summarize(state: ConversationState): string {
  return state.roles
    .map((role) => {
      const a = state.answers[role];
      const goals = a?.goals.length ? a.goals.join(", ") : "(no goals captured)";
      return `${role}: ${goals}`;
    })
    .join("\n");
}

// Advances from the end of one role's confirm step to the next role's
// goals question, or to the final confirmation if that was the last role.
function advancePastRole(state: ConversationState): ConversationState {
  const nextIndex = state.currentRoleIndex + 1;
  if (nextIndex < state.roles.length) {
    return { ...state, stage: "role_goals", currentRoleIndex: nextIndex };
  }
  return { ...state, stage: "final_confirm" };
}

export function processMessage(input: EngineInput): EngineOutput {
  const state = input.state ?? initialConversationState;
  const message = input.message.trim();

  switch (state.stage) {
    case "roles": {
      // First call has no message to parse yet — just ask.
      if (!message) {
        return {
          reply:
            "What are the different hats you wear day to day? Add as many as apply — you can always change these later.",
          state,
          action: { type: "ask" },
        };
      }
      const roles = splitList(message);
      const next: ConversationState = { ...state, stage: "roles_confirm", roles };
      return {
        reply: `Here's what I've got: ${roles.join(", ")}. Anything to add, cut, or rename before we go role by role?`,
        state: next,
        action: { type: "ask" },
      };
    }

    case "roles_confirm": {
      if (AFFIRMATIVE.test(message) || DECLINE_TO_EDIT.test(message)) {
        const next: ConversationState = {
          ...state,
          stage: "role_goals",
          currentRoleIndex: 0,
        };
        const role = currentRole(next);
        return {
          reply: `As ${role}, what are the 2-3 things that matter most to you right now? These don't have to be this week's tasks — think bigger picture.`,
          state: next,
          action: { type: "ask" },
        };
      }
      // Treat anything else as a revised role list.
      const roles = splitList(message);
      const next: ConversationState = { ...state, roles };
      return {
        reply: `Got it — updated to: ${roles.join(", ")}. Anything else to add, cut, or rename?`,
        state: next,
        action: { type: "ask" },
      };
    }

    case "role_goals": {
      const role = currentRole(state);
      const goals = splitList(message).slice(0, 3);
      const answers: Record<string, RoleAnswers> = {
        ...state.answers,
        [role]: { goals, context: state.answers[role]?.context ?? "" },
      };
      const next: ConversationState = { ...state, stage: "role_context", answers };
      return {
        reply: `Anything already on your calendar or in motion for ${role} that these should work around?`,
        state: next,
        action: { type: "ask" },
      };
    }

    case "role_context": {
      const role = currentRole(state);
      const existing = state.answers[role] ?? { goals: [], context: "" };
      const context = NEGATIVE.test(message) ? "" : message;
      const answers: Record<string, RoleAnswers> = {
        ...state.answers,
        [role]: { ...existing, context },
      };
      const next: ConversationState = { ...state, stage: "role_confirm", answers };
      const goalsList = answers[role].goals.join(", ") || "(none captured)";
      return {
        reply: `For ${role}: ${goalsList}. Sound right?`,
        state: next,
        action: { type: "ask" },
      };
    }

    case "role_confirm": {
      if (AFFIRMATIVE.test(message)) {
        const next = advancePastRole(state);
        if (next.stage === "final_confirm") {
          return {
            reply: `That's your starting point:\n${summarize(next)}\nI'll check in on these in your first weekly session. Ready to lock it in?`,
            state: next,
            action: { type: "ask" },
          };
        }
        const role = currentRole(next);
        return {
          reply: `As ${role}, what are the 2-3 things that matter most to you right now?`,
          state: next,
          action: { type: "ask" },
        };
      }
      // Not confirmed — re-ask this role's goals question.
      const role = currentRole(state);
      const next: ConversationState = { ...state, stage: "role_goals" };
      return {
        reply: `No problem — as ${role}, what are the 2-3 things that matter most to you right now?`,
        state: next,
        action: { type: "ask" },
      };
    }

    case "final_confirm": {
      if (AFFIRMATIVE.test(message)) {
        const next: ConversationState = { ...state, stage: "done", revisiting: null };
        return {
          reply: "Locked in. Onboarding complete.",
          state: next,
          action: { type: "complete", roles: state.roles, answers: state.answers },
        };
      }
      // Expect the user to name which role to revisit.
      const target = state.roles.find(
        (role) => role.toLowerCase() === message.toLowerCase(),
      );
      if (!target) {
        return {
          reply: `Which role should we revisit? (${state.roles.join(", ")})`,
          state,
          action: { type: "ask" },
        };
      }
      const next: ConversationState = {
        ...state,
        stage: "role_goals",
        currentRoleIndex: state.roles.indexOf(target),
        revisiting: target,
      };
      return {
        reply: `Let's redo ${target} — what are the 2-3 things that matter most to you right now?`,
        state: next,
        action: { type: "ask" },
      };
    }

    case "done": {
      return {
        reply: "Onboarding's already complete for this session.",
        state,
        action: { type: "complete", roles: state.roles, answers: state.answers },
      };
    }
  }
}
