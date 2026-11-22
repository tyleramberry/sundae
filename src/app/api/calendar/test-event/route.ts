import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createTestEvent, GoogleCalendarError } from "@/lib/google/calendar";
import {
  isDebugSurfaceAllowedForEmail,
  isProductionRuntime,
  productionUnavailableResponse,
} from "@/lib/devOnly";

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (isProductionRuntime() && !isDebugSurfaceAllowedForEmail(user?.email)) {
    return productionUnavailableResponse();
  }

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
