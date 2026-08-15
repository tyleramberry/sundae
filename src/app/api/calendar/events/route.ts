import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { listWeekEvents, GoogleCalendarError } from "@/lib/google/calendar";
import { parseDateOnly, planningWeekStartDate } from "@/lib/weeklySession/week";

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const url = new URL(request.url);
  const requested = url.searchParams.get("weekStart");
  const weekStart = requested ? parseDateOnly(requested) : planningWeekStartDate();
  if (!weekStart) {
    return NextResponse.json({ error: "Invalid weekStart" }, { status: 400 });
  }

  try {
    const events = await listWeekEvents(supabase, user.id, weekStart);
    return NextResponse.json(events);
  } catch (error) {
    if (error instanceof GoogleCalendarError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}
