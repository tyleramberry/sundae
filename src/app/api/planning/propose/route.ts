import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  GoogleCalendarError,
  endOfWeek,
  listCurrentWeekEvents,
  startOfWeek,
} from "@/lib/google/calendar";
import { getOnboardingAnswers } from "@/lib/onboarding/persist";
import { proposeBlocks } from "@/lib/planning/blocks";

// Day 8: read-only proposal step. Loads the signed-in user's onboarding
// answers and current-week calendar, and returns candidate time blocks —
// nothing is written back to Google Calendar here. Per the MVP spec's
// permissions model ("Read calendar -> propose blocks -> user confirms ->
// write"), the write step only happens later, once the user has seen and
// confirmed these proposals (Day 10).
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const onboarding = await getOnboardingAnswers(supabase, user.id);
  if (!onboarding) {
    return NextResponse.json(
      { error: "No onboarding answers on file. Complete onboarding first." },
      { status: 400 },
    );
  }

  try {
    const events = await listCurrentWeekEvents(supabase, user.id);
    const now = new Date();
    const blocks = proposeBlocks(
      onboarding.answers,
      events.items ?? [],
      startOfWeek(now),
      endOfWeek(now),
      { now },
    );
    return NextResponse.json({ blocks });
  } catch (error) {
    if (error instanceof GoogleCalendarError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}
