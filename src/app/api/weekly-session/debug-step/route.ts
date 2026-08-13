import { NextResponse } from "next/server";
import { processWeeklySessionMessage } from "@/lib/engine/weeklySession";
import { isProductionRuntime, productionUnavailableResponse } from "@/lib/devOnly";
import type {
  ClassifiedAction,
  ConversationState,
  LastWeekContext,
  WeeklySessionMode,
} from "@/lib/engine/weeklySessionTypes";

// Debug-only wrapper around the weekly-session engine (Day 10), same spirit
// as /debug/engine for onboarding: no auth, no Supabase, roles/lastWeek
// passed straight through from the client so the SMART drill-down and
// rollover logic can be exercised by hand without a real onboarding record
// or a week of real weekly_items history sitting behind it. `mode` (Day 16)
// lets the addendum prompt be exercised the same way, without needing a
// real weekly_session_transcripts row marked completed_at first.
// `lockedActions` (bug fix) lets the debug page round-trip its own
// `actionsSoFar` back in, the same way the real route round-trips
// `transcript.actions_so_far` -- otherwise this harness couldn't exercise
// the locked-actions stability fix at all.
export async function POST(request: Request) {
  if (isProductionRuntime()) return productionUnavailableResponse();

  const body = (await request.json().catch(() => null)) as {
    message?: string;
    state?: ConversationState | null;
    roles?: string[];
    lastWeek?: LastWeekContext | null;
    mode?: WeeklySessionMode;
    lockedActions?: ClassifiedAction[];
  } | null;

  if (!body || typeof body.message !== "string" || !Array.isArray(body.roles)) {
    return NextResponse.json(
      { error: "Body must include `message: string` and `roles: string[]`." },
      { status: 400 },
    );
  }

  try {
    const result = await processWeeklySessionMessage({
      message: body.message,
      state: body.state,
      roles: body.roles,
      lastWeek: body.lastWeek,
      mode: body.mode,
      lockedActions: body.lockedActions,
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error("Weekly session debug step failed:", error);
    return NextResponse.json(
      { error: "The planning engine had trouble with that — try again." },
      { status: 502 },
    );
  }
}
