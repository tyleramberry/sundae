import type { SupabaseClient } from "@supabase/supabase-js";
import { startOfWeek } from "@/lib/google/calendar";
import type {
  ActionType,
  ClassifiedAction,
  ConversationState,
  LastWeekContext,
} from "@/lib/engine/weeklySessionTypes";
import type { ProposedAction } from "@/lib/planning/blocks";

// Supabase access for `weekly_items` (Day 10 schema). The weekly-session
// engine itself never touches Supabase (channel-agnostic, same boundary as
// onboarding's engine) -- this is the web caller's job.

export type WeeklyItemRow = {
  id: string;
  user_id: string;
  role: string;
  week_start: string;
  type: ActionType;
  title: string;
  google_event_id: string | null;
  done: boolean;
  percent: number | null;
  removed_at: string | null;
  created_at: string;
  updated_at: string;
};

// Exported so the Day 11 reconciliation cron computes "this week" the exact
// same way this module does when it wrote the rows in the first place --
// one definition of week_start's string format, not two that could drift.
export function toDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10); // week_start is a `date` column
}

export function currentWeekStart(referenceDate: Date = new Date()): string {
  return toDateOnly(startOfWeek(referenceDate));
}

// Reads last week's not-removed items for Stage 1 (Accountability). Returns
// null when there's nothing to review -- either the user's first-ever
// session, or a prior week with nothing planned -- which tells the engine
// to skip Stage 1 entirely (see weeklySession.ts's formatLastWeek).
export async function getLastWeekContext(
  supabase: SupabaseClient,
  userId: string,
  referenceDate: Date = new Date(),
): Promise<LastWeekContext | null> {
  const thisWeekStart = startOfWeek(referenceDate);
  const lastWeekStart = new Date(thisWeekStart);
  lastWeekStart.setDate(lastWeekStart.getDate() - 7);
  const weekStart = toDateOnly(lastWeekStart);

  const { data, error } = await supabase
    .from("weekly_items")
    .select("role, type, title, done, percent")
    .eq("user_id", userId)
    .eq("week_start", weekStart)
    .is("removed_at", null);

  if (error) {
    throw new Error(`Failed to load last week's items: ${error.message}`);
  }

  if (!data || data.length === 0) return null;

  return {
    weekStart,
    items: data.map((row) => ({
      role: row.role,
      type: row.type as ActionType,
      title: row.title,
      done: row.done,
      percent: row.percent,
    })),
  };
}

type WeeklyItemInsert = {
  user_id: string;
  role: string;
  week_start: string;
  type: ActionType;
  title: string;
  google_event_id: string | null;
  percent: number | null;
};

// Persists the confirmed session: one `weekly_items` row per written
// calendar block for Habit/Goal actions (matching the KPI denominator --
// see docs/weekly-session-flow.md), one row per Project action (percent
// starts at 0, no calendar block, no google_event_id). `writtenBlocks` maps
// each proposed action's blocks to the real Google Calendar event ID
// returned by the write call -- the caller (the confirm route) is
// responsible for actually writing to Google Calendar before calling this;
// this function is Supabase-only.
export async function createWeeklyItems(
  supabase: SupabaseClient,
  userId: string,
  referenceDate: Date,
  actions: (ProposedAction & { eventIds: string[]; percent?: number | null })[],
): Promise<number> {
  const weekStart = toDateOnly(startOfWeek(referenceDate));

  const rows: WeeklyItemInsert[] = [];
  for (const action of actions) {
    if (action.type === "project") {
      const percent =
        typeof action.percent === "number"
          ? Math.max(0, Math.min(100, Math.round(action.percent)))
          : 0;
      rows.push({
        user_id: userId,
        role: action.role,
        week_start: weekStart,
        type: "project",
        title: action.description,
        google_event_id: null,
        percent,
      });
      continue;
    }

    // One row per written block -- a Habit with cadenceCount 7 gets 7
    // independently-checkable rows, each counting 1 toward the role's
    // denominator, per the pooled KPI formula.
    for (const eventId of action.eventIds) {
      rows.push({
        user_id: userId,
        role: action.role,
        week_start: weekStart,
        type: action.type,
        title: action.description,
        google_event_id: eventId,
        percent: null,
      });
    }
  }

  if (rows.length === 0) return 0;

  const { error } = await supabase.from("weekly_items").insert(rows);
  if (error) {
    throw new Error(`Failed to save weekly items: ${error.message}`);
  }

  return rows.length;
}

// Re-exported for callers that only have the engine's flat action list and
// want to sanity-check shape before sending it to /propose -- not currently
// used outside this module's own tests, kept here so persist.ts stays the
// one place that knows the ClassifiedAction <-> weekly_items mapping.
export type { ClassifiedAction };

// --- weekly_session_transcripts (Day 16 -- chat persistence + mid-week
// addenda) -----------------------------------------------------------------
//
// See the migration's header comment for the full design. Short version:
// `display_turns` is the whole week's chat, for the user to read back;
// `active_state` is only the *current round's* conversation, the one
// actually fed to Claude -- the two diverge the moment a round gets
// confirmed (recordWeeklySessionConfirmed resets active_state, never
// display_turns).

// UI turn shape, matching the web page's own `Turn` type exactly -- kept
// here (not re-exported from a shared module) since it's a display concern
// specific to this persistence boundary, not part of the channel-agnostic
// engine's vocabulary the way ConversationState's Turn is.
export type DisplayTurn = { from: "engine" | "user"; text: string };

export type WeeklySessionTranscriptRow = {
  id: string;
  user_id: string;
  week_start: string;
  display_turns: DisplayTurn[];
  active_state: ConversationState;
  actions_so_far: ClassifiedAction[];
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export async function getWeeklySessionTranscript(
  supabase: SupabaseClient,
  userId: string,
  weekStart: string,
): Promise<WeeklySessionTranscriptRow | null> {
  const { data, error } = await supabase
    .from("weekly_session_transcripts")
    .select("*")
    .eq("user_id", userId)
    .eq("week_start", weekStart)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load weekly session transcript: ${error.message}`);
  }

  return data;
}

type SaveTranscriptInput = {
  userId: string;
  weekStart: string;
  displayTurns: DisplayTurn[];
  activeState: ConversationState;
  actionsSoFar: ClassifiedAction[];
};

// Called after every real turn (full-session or addendum-round alike) so a
// refresh mid-conversation never loses progress. Deliberately never
// includes `completed_at` in the payload -- Supabase's upsert only issues
// `SET` for the columns actually sent, so an in-progress round's turns
// never clobber a completed_at a previous round already set.
export async function saveWeeklySessionTranscript(
  supabase: SupabaseClient,
  { userId, weekStart, displayTurns, activeState, actionsSoFar }: SaveTranscriptInput,
): Promise<void> {
  const { error } = await supabase.from("weekly_session_transcripts").upsert(
    {
      user_id: userId,
      week_start: weekStart,
      display_turns: displayTurns,
      active_state: activeState,
      actions_so_far: actionsSoFar,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,week_start" },
  );

  if (error) {
    throw new Error(`Failed to save weekly session transcript: ${error.message}`);
  }
}

type RecordConfirmedInput = {
  userId: string;
  weekStart: string;
  // A short engine-style bubble appended to display_turns marking what
  // just got written -- e.g. "5 items written to your calendar." -- so
  // scrolling back through the week's chat shows exactly where each round
  // closed out, not just an unexplained gap.
  confirmationMessage: string;
};

// Called once /api/weekly-session/confirm actually writes a plan (the
// original full session, or a later mid-week addendum round) to the
// calendar + weekly_items. Resets active_state/actions_so_far so the next
// message starts a fresh, small round instead of replaying this week's
// whole history back into Claude -- see the migration's header comment for
// why that's a correctness requirement (avoiding a duplicate re-listing of
// already-confirmed items), not just a cost one. display_turns is
// untouched apart from the appended marker -- it never resets.
export async function recordWeeklySessionConfirmed(
  supabase: SupabaseClient,
  { userId, weekStart, confirmationMessage }: RecordConfirmedInput,
): Promise<{ isFirstConfirmThisWeek: boolean }> {
  const existing = await getWeeklySessionTranscript(supabase, userId, weekStart);
  const isFirstConfirmThisWeek = !existing?.completed_at;
  const displayTurns: DisplayTurn[] = [
    ...(existing?.display_turns ?? []),
    { from: "engine", text: confirmationMessage },
  ];

  const { error } = await supabase.from("weekly_session_transcripts").upsert(
    {
      user_id: userId,
      week_start: weekStart,
      display_turns: displayTurns,
      active_state: { turns: [] },
      actions_so_far: [],
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,week_start" },
  );

  if (error) {
    throw new Error(`Failed to record weekly session confirmation: ${error.message}`);
  }

  // Only the week's first confirm sets completed_at -- scoping the update
  // to `.is("completed_at", null)` means a later addendum confirm matches
  // zero rows here and silently no-ops, rather than needing a separate
  // read-then-branch.
  if (isFirstConfirmThisWeek) {
    const { error: completeError } = await supabase
      .from("weekly_session_transcripts")
      .update({ completed_at: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("week_start", weekStart)
      .is("completed_at", null);

    if (completeError) {
      throw new Error(`Failed to mark weekly session confirmed: ${completeError.message}`);
    }
  }

  return { isFirstConfirmThisWeek };
}
