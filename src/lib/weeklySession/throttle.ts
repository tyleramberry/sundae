import type { SupabaseClient } from "@supabase/supabase-js";

// Day 11 rate limiting for the weekly-session engine, added after a real
// cost-exposure discussion during Day 10: nothing stops a signed-in
// subscriber from scripting /api/weekly-session/step into an unbounded
// loop of real Claude calls, since the engine is stateless and trusts
// whatever `state` the client hands back turn to turn. Two independent
// guards, both enforced by the caller (this module + step/route.ts), not
// the engine itself -- weeklySession.ts stays channel-agnostic per its file
// header.

// Hard-stop per session. Bug fix: 50 was the top of the Day 11 plan's
// ~40-50 range, picked before any real multi-role session had actually run
// end to end. A real user with several roles blew straight through it --
// 51 turns for a 7-role Accountability + SMART drill-down (Founder,
// Athlete, Husband, Employee, Student, Disciple of Jesus Christ, Personal)
// that wasn't even done yet, at which point every further message 429s
// before it reaches Claude, with no way to finish (or reset) the round --
// a dead end, not just a slowdown. Raised generously so a genuinely
// thorough multi-role session has real headroom; still nowhere near what
// an actual scripted/unbounded loop would rack up, so it doesn't meaningfully
// weaken the cost guard this exists for.
export const TURN_CAP = 150;

export function hasHitTurnCap(turnCount: number): boolean {
  return turnCount >= TURN_CAP;
}

export const TURN_CAP_MESSAGE =
  "This session has been running a while -- let's pick it up again later. Start a new weekly session whenever you're ready to continue.";

export const SESSION_THROTTLE_MESSAGE =
  "You've already started this week's session today. If you were in the middle of it, come back to that conversation -- otherwise, check back tomorrow to start a new one.";

// A "session start" is any call with no prior state (or an empty turns
// array) -- the very first message of a fresh weekly session. Continuing
// an existing session (state.turns.length > 0) never counts as a new
// start, so this only blocks a client opening a *second* fresh session the
// same day, not resuming the one already in progress.
export async function hasStartedSessionToday(
  supabase: SupabaseClient,
  userId: string,
): Promise<boolean> {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const { count, error } = await supabase
    .from("weekly_session_starts")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("started_at", startOfDay.toISOString());

  if (error) {
    throw new Error(`Failed to check weekly session throttle: ${error.message}`);
  }

  return (count ?? 0) > 0;
}

// Recorded only after the engine call for a fresh session actually
// succeeds -- see the migration's header comment for why (a failed first
// attempt shouldn't burn the user's one real start for the day).
export async function recordSessionStart(
  supabase: SupabaseClient,
  userId: string,
): Promise<void> {
  const { error } = await supabase
    .from("weekly_session_starts")
    .insert({ user_id: userId });

  if (error) {
    throw new Error(`Failed to record weekly session start: ${error.message}`);
  }
}
