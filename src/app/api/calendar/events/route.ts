import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { listCurrentWeekEvents, GoogleCalendarError } from "@/lib/google/calendar";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  try {
    const events = await listCurrentWeekEvents(supabase, user.id);
    return NextResponse.json(events);
  } catch (error) {
    if (error instanceof GoogleCalendarError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}
