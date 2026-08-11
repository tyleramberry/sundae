import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { processWeeklySessionMessage } from "@/lib/engine/weeklySession";
import { getLastWeekContext } from "@/lib/weeklySession/persist";
import { getOnboardingAnswers } from "@/lib/onboarding/persist";
import {
  SESSION_THROTTLE_MESSAGE,
  TURN_CAP_MESSAGE,
  hasHitTurnCap,
  hasStartedSessionToday,
  recordSessionStart,
} from "@/lib/weeklySession/throttle";
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

  // Day 7 redesign: roles/goals no longer come from /onboarding -- the
  // weekly-session page runs that conversation itself (Stage 0) the first
  // time a user gets here with no row yet, and only calls this route once
  // that's saved. This guard is now a safety net against a client that
  // skipped straight here, not the expected first-run path.
  const onboarding = await getOnboardingAnswers(supabase, user.id);
  if (!onboarding || onboarding.roles.length === 0) {
    return NextResponse.json(
      { error: "No roles on file yet. Start at /weekly-session to set them up first." },
      { status: 400 },
    );
  }

  // Day 11 rate limiting -- see src/lib/weeklySession/throttle.ts for why
  // both guards exist. Turn cap first since it's a pure check against what
  // the client already sent; the session-start throttle needs a query, so
  // it only runs once we know this call would actually need it.
  const turnCount = body.state?.turns.length ?? 0;
  if (hasHitTurnCap(turnCount)) {
    return NextResponse.json({ error: TURN_CAP_MESSAGE }, { status: 429 });
  }

  const isFreshStart = turnCount === 0;
  if (isFreshStart) {
    const alreadyStartedToday = await hasStartedSessionToday(supabase, user.id);
    if (alreadyStartedToday) {
      return NextResponse.json({ error: SESSION_THROTTLE_MESSAGE }, { status: 429 });
    }
  }

  try {
    const lastWeek = await getLastWeekContext(supabase, user.id);
    const result = await processWeeklySessionMessage({
      message: body.message,
      state: body.state,
      roles: onboarding.roles,
      lastWeek,
    });

    if (isFreshStart) {
      // Best-effort: the user's real reply already succeeded, so a logging
      // hiccup here shouldn't fail their request -- worst case is one
      // extra start slipping through if this insert is the thing that
      // fails, which is an acceptable edge case for an MVP guard.
      await recordSessionStart(supabase, user.id).catch((err) => {
        console.error("Failed to record weekly session start:", err);
      });
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("Weekly session step failed:", error);
    return NextResponse.json(
      { error: "The planning engine had trouble with that — try again." },
      { status: 502 },
    );
  }
}
