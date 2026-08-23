import type { SupabaseClient } from "@supabase/supabase-js";
import { startOfWeek } from "@/lib/google/calendar";
import { addDays, planningWeekStartDate } from "@/lib/weeklySession/week";
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
// Format using the Date's local Y-M-D, not UTC. startOfWeek zeros local
// midnight; toISOString() would shift that to the previous calendar date
// in timezones ahead of UTC (Sunday 00:00 UTC+14 -> Saturday).
export function toDateOnly(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
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
  const thisWeekStart = planningWeekStartDate(referenceDate);
  const lastWeekStart = addDays(thisWeekStart, -7);
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
  const weekStart = toDateOnly(planningWeekStartDate(referenceDate));

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

    // One row per INTENDED block -- `wanted` total, matching the exact
    // formula proposeActionBlocks used to decide how many slots to look
    // for -- each independently-checkable toward the role's denominator
    // per the pooled KPI formula. Bug fix: this used to insert one row per
    // *actual* eventId only, so a Habit that got fewer real calendar
    // blocks than its cadence -- including the all-day-event incident,
    // where every action got zero -- silently lost the difference with no
    // record it was ever meant to be more than however many happened to
    // land. Any block short of `wanted` still gets a row, just with
    // google_event_id left null, so the dashboard, the plan panel, and a
    // later retry (see /api/weekly-session/retry-calendar) all see the
    // true intended count, not a collapsed one.
    const wanted = action.type === "habit" ? Math.max(1, action.cadenceCount ?? 1) : 1;
    for (let i = 0; i < wanted; i++) {
      rows.push({
        user_id: userId,
        role: action.role,
        week_start: weekStart,
        type: action.type,
        title: action.description,
        google_event_id: action.eventIds[i] ?? null,
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

export type PendingProposedAction = {
  role: string;
  description: string;
  type: ActionType;
  // conflictsWith: set when this exact slot overlaps something already on
  // the calendar (or another block this same round already placed) -- see
  // blocks.ts's file header for the placement redesign this supports.
  // Never causes a block to move; only tells the confirm screen to ask
  // before writing it.
  blocks: { start: string; end: string; conflictsWith?: string }[];
  // Bug fix: round-trips the engine's original cadenceCount/preferredTime
  // through the propose -> client -> confirm boundary, same reasoning as
  // ProposedAction gaining these fields in blocks.ts -- without them,
  // createWeeklyItems has no way to know a Habit with 0 (or fewer than
  // cadenceCount) real blocks was ever meant to be more than a single row.
  cadenceCount?: number;
  preferredTime?: string;
  // Round-tripped end-to-end (engine -> /propose -> client -> /confirm) so
  // the confirmed Google Calendar event's length matches what the user
  // actually asked for, instead of the batch default -- same reasoning as
  // cadenceCount/preferredTime immediately above.
  durationMinutes?: number;
  // Habit-only, round-tripped the same way so /confirm can pass an RRULE
  // through createCalendarEvent for exactly one master event per action
  // instead of N one-off events. See ClassifiedAction.recurrence for the
  // engine-layer shape; the field is identical here.
  recurrence?: ClassifiedAction["recurrence"];
};

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
  round_seq: number;
  confirming_at: string | null;
  last_confirm_fingerprint: string | null;
  pending_proposed: PendingProposedAction[] | null;
  pending_session_actions: ClassifiedAction[] | null;
};

export class StaleTranscriptError extends Error {
  constructor() {
    super("This week's session moved on — refresh and try that message again.");
    this.name = "StaleTranscriptError";
  }
}

export class ConfirmInProgressError extends Error {
  constructor() {
    super("A confirm is already writing this plan. Wait a moment rather than clicking again.");
    this.name = "ConfirmInProgressError";
  }
}

const STALE_CONFIRM_LOCK_MS = 10 * 60 * 1000;

export function fingerprintProposed(proposed: PendingProposedAction[]): string {
  return JSON.stringify(
    proposed.map((action) => ({
      role: action.role,
      description: action.description,
      type: action.type,
      blocks: action.blocks.map((b) => ({ start: b.start, end: b.end })),
    })),
  );
}

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

// Hydrate the right-hand plan panel from confirmed weekly_items so the
// plan survives confirm the same way the chat transcript does. Duplicate
// habit rows (one per cadence block) collapse back to a single action.
export function classifiedActionsFromWeeklyItems(
  rows: { role: string; type: ActionType; title: string }[],
): ClassifiedAction[] {
  const grouped = new Map<string, ClassifiedAction & { count: number }>();
  for (const row of rows) {
    const key = `${row.role}\0${row.type}\0${row.title}`;
    const existing = grouped.get(key);
    if (existing) {
      existing.count += 1;
      existing.cadenceCount = existing.count;
      continue;
    }
    grouped.set(key, {
      role: row.role,
      description: row.title,
      type: row.type,
      cadenceCount: row.type === "habit" ? 1 : undefined,
      count: 1,
    });
  }

  return [...grouped.values()].map((entry) => {
    const { count: _count, ...action } = entry;
    if (action.type !== "habit") {
      delete action.cadenceCount;
    }
    return action;
  });
}

export async function getCommittedPlanActions(
  supabase: SupabaseClient,
  userId: string,
  weekStart: string,
): Promise<ClassifiedAction[]> {
  const { data, error } = await supabase
    .from("weekly_items")
    .select("role, type, title")
    .eq("user_id", userId)
    .eq("week_start", weekStart)
    .is("removed_at", null)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`Failed to load this week's plan: ${error.message}`);
  }

  return classifiedActionsFromWeeklyItems(
    (data ?? []) as { role: string; type: ActionType; title: string }[],
  );
}

type SaveTranscriptInput = {
  userId: string;
  weekStart: string;
  displayTurns: DisplayTurn[];
  activeState: ConversationState;
  actionsSoFar: ClassifiedAction[];
  // Seq loaded at the start of this /step. The write is rejected if
  // /confirm incremented it in the meantime (stale Claude round-trip).
  expectedRoundSeq: number;
};

// Called after every real turn (full-session or addendum-round alike) so a
// refresh mid-conversation never loses progress. Deliberately never
// includes `completed_at` in the payload -- an in-progress round's turns
// must not clobber a completed_at a previous round already set. The
// round_seq match is what stops a late /step from resurrecting pre-confirm
// active_state after the row was reset.
export async function saveWeeklySessionTranscript(
  supabase: SupabaseClient,
  {
    userId,
    weekStart,
    displayTurns,
    activeState,
    actionsSoFar,
    expectedRoundSeq,
  }: SaveTranscriptInput,
): Promise<void> {
  const existing = await getWeeklySessionTranscript(supabase, userId, weekStart);

  if (!existing) {
    const { error } = await supabase.from("weekly_session_transcripts").insert({
      user_id: userId,
      week_start: weekStart,
      display_turns: displayTurns,
      active_state: activeState,
      actions_so_far: actionsSoFar,
      round_seq: expectedRoundSeq,
      updated_at: new Date().toISOString(),
    });

    if (error) {
      // A confirm (or another step) created the row first -- treat as stale
      // rather than blindly upserting over it.
      if (error.code === "23505") throw new StaleTranscriptError();
      throw new Error(`Failed to save weekly session transcript: ${error.message}`);
    }
    return;
  }

  if ((existing.round_seq ?? 0) !== expectedRoundSeq) {
    throw new StaleTranscriptError();
  }

  const { data, error } = await supabase
    .from("weekly_session_transcripts")
    .update({
      display_turns: displayTurns,
      active_state: activeState,
      actions_so_far: actionsSoFar,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .eq("week_start", weekStart)
    .eq("round_seq", expectedRoundSeq)
    .select("id")
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to save weekly session transcript: ${error.message}`);
  }
  if (!data) throw new StaleTranscriptError();
}

export async function savePendingProposal(
  supabase: SupabaseClient,
  userId: string,
  weekStart: string,
  proposed: PendingProposedAction[],
  sessionActions: ClassifiedAction[],
): Promise<void> {
  const { error } = await supabase
    .from("weekly_session_transcripts")
    .update({
      pending_proposed: proposed,
      pending_session_actions: sessionActions,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .eq("week_start", weekStart);

  if (error) {
    throw new Error(`Failed to save pending proposal: ${error.message}`);
  }
}

export type BeginConfirmResult = "ok" | "duplicate";

// Compare-and-swap the confirm lock. Duplicate fingerprint after a
// finished confirm is idempotent success. A live lock (or a steal of a
// stale one) is the only other path that returns to the caller.
export async function tryBeginConfirm(
  supabase: SupabaseClient,
  userId: string,
  weekStart: string,
  fingerprint: string,
): Promise<BeginConfirmResult> {
  const existing = await getWeeklySessionTranscript(supabase, userId, weekStart);

  if (
    existing?.last_confirm_fingerprint === fingerprint &&
    !existing.confirming_at
  ) {
    return "duplicate";
  }

  if (existing?.confirming_at) {
    const age = Date.now() - new Date(existing.confirming_at).getTime();
    if (age < STALE_CONFIRM_LOCK_MS) {
      throw new ConfirmInProgressError();
    }
    const { error: clearError } = await supabase
      .from("weekly_session_transcripts")
      .update({ confirming_at: null })
      .eq("user_id", userId)
      .eq("week_start", weekStart)
      .eq("confirming_at", existing.confirming_at);
    if (clearError) {
      throw new Error(`Failed to clear stale confirm lock: ${clearError.message}`);
    }
  }

  const now = new Date().toISOString();

  if (!existing) {
    const { error } = await supabase.from("weekly_session_transcripts").insert({
      user_id: userId,
      week_start: weekStart,
      confirming_at: now,
      updated_at: now,
    });
    if (error) {
      if (error.code === "23505") throw new ConfirmInProgressError();
      throw new Error(`Failed to begin confirm: ${error.message}`);
    }
    return "ok";
  }

  const { data, error } = await supabase
    .from("weekly_session_transcripts")
    .update({ confirming_at: now, updated_at: now })
    .eq("user_id", userId)
    .eq("week_start", weekStart)
    .is("confirming_at", null)
    .select("id")
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to begin confirm: ${error.message}`);
  }
  if (!data) throw new ConfirmInProgressError();
  return "ok";
}

export async function clearConfirmingAt(
  supabase: SupabaseClient,
  userId: string,
  weekStart: string,
): Promise<void> {
  const { error } = await supabase
    .from("weekly_session_transcripts")
    .update({ confirming_at: null, updated_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("week_start", weekStart);

  if (error) {
    throw new Error(`Failed to clear confirm lock: ${error.message}`);
  }
}

type RecordConfirmedInput = {
  userId: string;
  weekStart: string;
  confirmationMessage: string;
  fingerprint: string;
};

// Called once /api/weekly-session/confirm actually writes a plan (the
// original full session, or a later mid-week addendum round) to the
// calendar + weekly_items. Resets active_state/actions_so_far so the next
// message starts a fresh, small round instead of replaying this week's
// whole history back into Claude -- see the migration's header comment for
// why that's a correctness requirement (avoiding a duplicate re-listing of
// already-confirmed items), not just a cost one. display_turns is
// untouched apart from the appended marker -- it never resets.
// round_seq bumps here so an in-flight /step that loaded the previous seq
// cannot save over this reset.
export async function recordWeeklySessionConfirmed(
  supabase: SupabaseClient,
  { userId, weekStart, confirmationMessage, fingerprint }: RecordConfirmedInput,
): Promise<{ isFirstConfirmThisWeek: boolean }> {
  const existing = await getWeeklySessionTranscript(supabase, userId, weekStart);
  const isFirstConfirmThisWeek = !existing?.completed_at;
  const displayTurns: DisplayTurn[] = [
    ...(existing?.display_turns ?? []),
    { from: "engine", text: confirmationMessage },
  ];
  const nextSeq = (existing?.round_seq ?? 0) + 1;

  const { error } = await supabase.from("weekly_session_transcripts").upsert(
    {
      user_id: userId,
      week_start: weekStart,
      display_turns: displayTurns,
      active_state: { turns: [] },
      actions_so_far: [],
      round_seq: nextSeq,
      confirming_at: null,
      last_confirm_fingerprint: fingerprint,
      pending_proposed: null,
      pending_session_actions: null,
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
