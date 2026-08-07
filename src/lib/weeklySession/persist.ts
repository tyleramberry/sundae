import type { SupabaseClient } from "@supabase/supabase-js";
import { startOfWeek } from "@/lib/google/calendar";
import type {
  ActionType,
  ClassifiedAction,
  LastWeekContext,
} from "@/lib/engine/weeklySessionTypes";
import type { ProposedAction } from "@/lib/planning/blocks";

// Supabase access for `weekly_items` (Day 10 schema). The weekly-session
// engine itself never touches Supabase (channel-agnostic, same boundary as
// onboarding's engine) -- this is the web caller's job.

// Exported so the Day 11 reconciliation cron computes "this week" the exact
// same way this module does when it wrote the rows in the first place --
// one definition of week_start's string format, not two that could drift.
export function toDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10); // week_start is a `date` column
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
  actions: (ProposedAction & { eventIds: string[] })[],
): Promise<number> {
  const weekStart = toDateOnly(startOfWeek(referenceDate));

  const rows: WeeklyItemInsert[] = [];
  for (const action of actions) {
    if (action.type === "project") {
      rows.push({
        user_id: userId,
        role: action.role,
        week_start: weekStart,
        type: "project",
        title: action.description,
        google_event_id: null,
        percent: 0,
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
