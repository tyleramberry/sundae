// Types for the weekly session engine (Day 10). Sibling to
// src/lib/engine/types.ts per the 30-day plan's instruction, not an
// extension of it -- this is a distinct engine module (see
// docs/weekly-session-flow.md and weeklySession.ts's file header for why).
//
// `Turn`/`ConversationState` are the exact same shape onboarding uses --
// re-exported from ./types rather than redefined, since "state is just the
// transcript" is a property of the engine pattern itself, not something
// specific to onboarding.

export type { Turn, ConversationState } from "@/lib/engine/types";
import type { ConversationState } from "@/lib/engine/types";

export type ActionType = "habit" | "goal" | "project";

// One classified action item, produced by Stage 3 (Planning) -- see
// docs/weekly-session-flow.md's "Classification rule" and
// "Cadence-parsing rule". This is what becomes a `weekly_items` row once
// the user confirms (Day 10's wiring step, not this engine).
export type ClassifiedAction = {
  role: string;
  description: string;
  type: ActionType;
  // Habit: number of calendar blocks implied by the stated cadence (7 for
  // "every day"/"every morning", N for "N times a week", etc). Goal: always
  // 1 (may be omitted -- callers should treat a missing cadenceCount on a
  // Goal as 1). Project: always omitted -- no calendar block at all.
  cadenceCount?: number;
};

// What the caller already knows about last week, read from `weekly_items`
// before the session starts -- the engine itself never touches Supabase,
// same channel-agnostic boundary as onboarding's engine.
export type LastWeekItem = {
  role: string;
  type: ActionType;
  title: string;
  done: boolean;
  percent: number | null; // project only
};

export type LastWeekContext = {
  weekStart: string; // ISO date (YYYY-MM-DD)
  items: LastWeekItem[];
};

export type WeeklySessionInput = {
  message: string;
  // Pass null/omit to start a fresh session.
  state?: ConversationState | null;
  // This week's roles, in the fixed order to run Goal Setting/Planning in
  // -- from onboarding_answers.roles. The engine doesn't reorder or invent
  // roles; that's the caller's job to supply correctly.
  roles: string[];
  // Omitted/null for a user's first-ever weekly session -- there's no
  // prior week to review, so Stage 1 (Accountability) is skipped entirely
  // and the session opens straight into Stage 2 for the first role.
  lastWeek?: LastWeekContext | null;
};

export type WeeklySessionAction =
  | { type: "ask" } // engine has a follow-up question, nothing to persist yet
  | { type: "complete"; actions: ClassifiedAction[] }; // all roles done, caller should persist

export type WeeklySessionOutput = {
  reply: string;
  state: ConversationState;
  action: WeeklySessionAction;
  // Grows turn-by-turn as action items get classified, same accumulation
  // pattern as onboarding's `answers` array -- lets the caller show
  // progress mid-session, and means a dropped connection doesn't lose
  // everything captured so far. Equal to `action.actions` once `done`.
  actionsSoFar: ClassifiedAction[];
};
