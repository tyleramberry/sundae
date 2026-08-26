// Channel-agnostic planning engine types.
//
// The engine is deliberately I/O-free from the caller's perspective: no
// Supabase, no knowledge of HTTP/SMS/voice. A caller (the web UI today,
// SMS/voice later per the MVP spec's Phase 2 roadmap) owns persistence and
// just round-trips `ConversationState` between calls. Internally the engine
// does call the Claude API to actually understand what the user said --
// that's the whole point (see engine.ts) -- but that's an implementation
// detail the caller never sees.

export type RoleAnswer = {
  role: string;
  goals: string[];
  context: string;
};

export type Turn = {
  role: "user" | "assistant";
  content: string;
};

// State is just the conversation transcript. Understanding "what stage are
// we at, what's been confirmed, what's still open" is the model's job every
// turn, not something a hand-rolled stage machine tracks -- that's what
// broke under real conversational input (see the Day 7 build recap).
export type ConversationState = {
  turns: Turn[];
};

export const initialConversationState: ConversationState = {
  turns: [],
};

export type EngineAction =
  | { type: "ask" } // engine has a follow-up question, nothing to persist yet
  | { type: "complete"; roles: string[]; answers: RoleAnswer[] }; // onboarding finished, caller should persist

export type EngineInput = {
  message: string;
  // Pass null/omit to start a fresh conversation.
  state?: ConversationState | null;
  // Optional PostHog distinct id for LLM traces. Omit for anonymous debug.
  userId?: string;
};

export type EngineOutput = {
  reply: string;
  state: ConversationState;
  action: EngineAction;
};
