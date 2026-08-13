import { NextResponse } from "next/server";
import { processMessage } from "@/lib/engine/engine";
import { createClient } from "@/lib/supabase/server";
import { TURN_CAP_MESSAGE, hasHitTurnCap } from "@/lib/weeklySession/throttle";
import type { ConversationState } from "@/lib/engine/types";

// Thin HTTP wrapper around the channel-agnostic onboarding engine. Used by
// production Stage 0 (roles setup on /weekly-session) and, locally, by
// /debug/engine. Requires a signed-in session: this route spends Claude
// tokens and used to be callable with no auth. Turn cap matches the weekly
// session so a scripted client can't loop unbounded calls; the engine
// itself stays I/O-free.
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

  const turnCount = body.state?.turns.length ?? 0;
  if (hasHitTurnCap(turnCount)) {
    return NextResponse.json({ error: TURN_CAP_MESSAGE }, { status: 429 });
  }

  try {
    const result = await processMessage({ message: body.message, state: body.state });
    return NextResponse.json(result);
  } catch (error) {
    console.error("Engine step failed:", error);
    return NextResponse.json(
      { error: "The planning engine had trouble with that — try again." },
      { status: 502 },
    );
  }
}
