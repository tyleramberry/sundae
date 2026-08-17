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
  // Habit/Goal only, "HH:MM" 24-hour local time -- the actual clock time
  // the user asked for ("2pm", "first thing in the morning" -> "07:00"),
  // captured by the Stage 3 drill-down instead of left to whichever gap
  // /propose finds first. Omitted only if the user genuinely has no
  // preference after being asked. Project: always omitted, same as
  // cadenceCount -- no calendar block to time.
  preferredTime?: string;
  // Habit/Goal only, 0=Sunday..6=Saturday -- the SINGLE specific day the
  // user named for this item, including a relative reference ("today",
  // "tonight") resolved against the actual date the message was sent.
  // Omitted when no single day applies: a cadence-only habit ("every day",
  // "3x this week") with no particular day named, or the user genuinely
  // didn't say. Bug fix: this used to live only as text inside
  // `description` ("...on Saturday", "...Monday through Friday") and get
  // reverse-engineered by a regex at scheduling time -- which silently
  // mis-fired on a range ("Monday through Friday" read as plain Monday)
  // and had no way to understand a relative word ("tonight") at all,
  // since it never saw the date the message was sent. Capturing it here,
  // resolved by the model with today's real date already in front of it,
  // removes that whole class of bug at the source instead of patching the
  // regex again. Project: always omitted, same as cadenceCount/preferredTime.
  weekday?: number;
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

// "full" is the original Accountability -> Goal Setting -> Planning arc,
// gated on every role getting an outcome. "addendum" is a lightweight
// mid-week continuation of the *same chat* (Day 16) -- used once the
// week's full session has already been confirmed once and the user comes
// back with one more thing to plan. It skips Stage 1/2 and the per-role
// gate entirely and applies just the Stage 3-style drill-down to whatever
// the user describes. Selecting the mode is the caller's job (see
// src/app/api/weekly-session/step/route.ts) -- the engine itself doesn't
// infer it from the transcript.
export type WeeklySessionMode = "full" | "addendum";

// Reserved role the engine itself appends to whatever roles the caller
// supplies -- see withPersonalRole below. Every session includes it, no
// matter what; it's a catch-all for anything that doesn't belong to one of
// the user's actual declared roles, not something set up during onboarding.
export const PERSONAL_ROLE = "Personal";

// Appends the reserved Personal role, unless the caller's own roles already
// include something case-insensitively equal to it (rare, but don't create
// a confusing duplicate if a user genuinely named a real role "Personal").
// Appended last so declared roles always run their Stage 2/3 drill-down
// first -- Personal is the catch-all that comes after, not a peer.
export function withPersonalRole(roles: string[]): string[] {
  const hasPersonal = roles.some(
    (r) => r.trim().toLowerCase() === PERSONAL_ROLE.toLowerCase(),
  );
  return hasPersonal ? roles : [...roles, PERSONAL_ROLE];
}

export type WeeklySessionInput = {
  message: string;
  // Pass null/omit to start a fresh session (or a fresh addendum round --
  // see weeklySession/persist.ts's active_state reset on confirm).
  state?: ConversationState | null;
  // This week's roles, in the fixed order to run Goal Setting/Planning in
  // -- from onboarding_answers.roles. The caller supplies its own declared
  // roles; the engine always appends one more of its own -- the reserved
  // "Personal" role (see withPersonalRole) -- so every session includes it,
  // no matter what the caller passed in. Still required in "addendum" mode,
  // so a new action item can be validated against a real role.
  roles: string[];
  // Inclusive Sunday–Saturday this session is planning, so the model and
  // the user stay aligned on "this week" (especially Friday/Saturday when
  // that range is the upcoming week, not the one that's almost over).
  weekLabel?: string;
  weekStart?: string;
  // Omitted/null for a user's first-ever weekly session -- there's no
  // prior week to review, so Stage 1 (Accountability) is skipped entirely
  // and the session opens straight into Stage 2 for the first role. Not
  // read at all in "addendum" mode.
  lastWeek?: LastWeekContext | null;
  // Defaults to "full" -- see WeeklySessionMode above.
  mode?: WeeklySessionMode;
  // Action items already classified and locked in earlier THIS ROUND (i.e.
  // the caller's persisted `actions_so_far` for the in-progress transcript
  // row, if any). The engine re-derives `actions` fresh from the transcript
  // every turn -- without this, nothing stops it from silently
  // re-classifying an item's role/type/cadence differently turn to turn as
  // new context arrives. Omit/empty for a fresh round.
  lockedActions?: ClassifiedAction[];
  // Bug fix: plain-text summary of this week's real Google Calendar busy
  // times (see src/lib/weeklySession/calendarSummary.ts), read-only context
  // so the engine can actually answer "do I have time for this?" instead of
  // claiming it has no calendar visibility. The caller (step/route.ts)
  // fetches and formats this fresh every turn -- same pattern as `lastWeek`
  // -- so it stays accurate if the user's calendar changes mid-session.
  // Omit when the calendar read itself failed/isn't connected; the caller
  // still passes an explicit "not available" string in that case rather
  // than omitting silently, so the model tells the user the real reason.
  calendarSummary?: string;
  // The user's real IANA timezone (e.g. "America/Denver"), forwarded from
  // the browser (see weekly-session/page.tsx's browserTimeZone()). Used to
  // state today's actual weekday/date in the user's own local time, so the
  // model can resolve "today"/"tonight"/"tomorrow" into the right
  // `weekday` (see ClassifiedAction.weekday) instead of guessing or
  // leaving it out. Falls back to the server's own zone if omitted --
  // still usually right, just not guaranteed to match the user like the
  // browser-supplied one is.
  timeZone?: string;
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
  // Raw token usage for this turn's API call, straight from
  // response.usage -- surfaced so callers (debug tooling today, real
  // per-user cost logging per the Day 11 rate-limiting plan later) can see
  // whether prompt caching is actually landing. cacheReadInputTokens > 0
  // means the cached system prompt / prior transcript was served cheap
  // instead of reprocessed at full price.
  usage: {
    inputTokens: number;
    outputTokens: number;
    cacheCreationInputTokens: number;
    cacheReadInputTokens: number;
  };
};
