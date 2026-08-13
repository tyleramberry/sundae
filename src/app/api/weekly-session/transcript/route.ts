import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { currentWeekStart, getWeeklySessionTranscript } from "@/lib/weeklySession/persist";

// Day 16: page-load hydration for the weekly-session chat. Returns this
// week's persisted transcript (or `{ transcript: null }` for a user with
// no session yet this week) so a fresh page load can resume the
// conversation instead of always starting a brand-new one -- the actual
// "persists through Sunday night, or until a new week's session starts"
// behavior falls straight out of keying the lookup on the current
// week_start, no separate expiry needed (see the migration's header
// comment). Read-only; writes only ever happen from /step and /confirm.
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const weekStart = currentWeekStart();
  const transcript = await getWeeklySessionTranscript(supabase, user.id, weekStart);

  if (!transcript) {
    return NextResponse.json({ transcript: null });
  }

  return NextResponse.json({
    transcript: {
      weekStart: transcript.week_start,
      displayTurns: transcript.display_turns,
      actionsSoFar: transcript.actions_so_far,
      completedThisWeek: transcript.completed_at !== null,
    },
  });
}
