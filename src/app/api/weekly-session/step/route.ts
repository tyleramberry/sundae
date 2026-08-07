import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { processWeeklySessionMessage } from "@/lib/engine/weeklySession";
import { getLastWeekContext } from "@/lib/weeklySession/persist";
import { getOnboardingAnswers } from "@/lib/onboarding/persist";
import type { ConversationState } from "@/lib/engine/weeklySessionTypes";

// Thin HTTP wrapper around the weekly-session engine, same shape as
// /api/engine/step for onboarding. The one real difference: this engine
// needs read-only context it can't derive from the transcript alone (this
// week's role order, last week's weekly_items) -- fetched fresh here on
// every step rather than trusted from the client, same "any request body is
// untrusted" stance as onboarding/complete.
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as {
    message?: string;
    state?: ConversationState | null;
  } | null;

  if (!body || typeof body.message !== "string") {
    return NextResponse.json(
      { error: "Body must include a string `message` field." },
      { status: 400 },
    );
  }

  const onboarding = await getOnboardingAnswers(supabase, user.id);
  if (!onboarding || onboarding.roles.length === 0) {
    return NextResponse.json(
      { error: "No onboarding answers on file. Complete onboarding first." },
      { status: 400 },
    );
  }

  try {
    const lastWeek = await getLastWeekContext(supabase, user.id);
    const result = await processWeeklySessionMessage({
      message: body.message,
      state: body.state,
      roles: onboarding.roles,
      lastWeek,
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error("Weekly session step failed:", error);
    return NextResponse.json(
      { error: "The planning engine had trouble with that — try again." },
      { status: 502 },
    );
  }
}
