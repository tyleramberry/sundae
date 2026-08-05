// Channel-agnostic planning engine types.
//
// The engine is deliberately I/O-free: no Supabase, no fetch, no knowledge
// of HTTP/SMS/voice. A caller (the web UI today, SMS/voice later per the
// MVP spec's Phase 2 roadmap) owns persistence and just round-trips
// `ConversationState` between calls.

export type RoleAnswers = {
  goals: string[];
  context: string;
};

export type OnboardingStage =
  | "roles" // collecting the role list (Q1)
  | "roles_confirm" // confirming the role list (Q2)
  | "role_goals" // "what matters most" for the current role (Q3)
  | "role_context" // "anything already in motion" for the current role (Q4)
  | "role_confirm" // per-role confirmation (Q5)
  | "final_confirm" // full summary confirmation (Q6)
  | "done"; // onboarding complete, ready to persist

export type ConversationState = {
  stage: OnboardingStage;
  roles: string[];
  currentRoleIndex: number;
  answers: Record<string, RoleAnswers>;
  // Role name currently being revised via the Q6 "no, revisit X" path.
  revisiting: string | null;
};

export const initialConversationState: ConversationState = {
  stage: "roles",
  roles: [],
  currentRoleIndex: 0,
  answers: {},
  revisiting: null,
};

export type EngineAction =
  | { type: "ask" } // engine has a follow-up question, nothing to persist yet
  | { type: "complete"; roles: string[]; answers: Record<string, RoleAnswers> }; // onboarding finished, caller should persist

export type EngineInput = {
  message: string;
  // Pass null/omit to start a fresh conversation.
  state?: ConversationState | null;
};

export type EngineOutput = {
  reply: string;
  state: ConversationState;
  action: EngineAction;
};
