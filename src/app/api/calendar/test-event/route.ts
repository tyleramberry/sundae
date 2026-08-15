import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createTestEvent, GoogleCalendarError } from "@/lib/google/calendar";
import { isProductionRuntime, productionUnavailableResponse } from "@/lib/devOnly";

export async function POST() {
  if (isProductionRuntime()) return productionUnavailableResponse();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  try {
    const event = await createTestEvent(supabase, user.id);
    return NextResponse.json(event);
  } catch (error) {
    if (error instanceof GoogleCalendarError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}
