import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { revisePlan } from "@/lib/engine/revisePlan";
import { isClassifiedAction } from "@/lib/weeklySession/parseActions";
import type { ClassifiedAction } from "@/lib/engine/weeklySessionTypes";
import { getWeeklySessionTranscript } from "@/lib/weeklySession/persist";
import { planningWeekStart } from "@/lib/weeklySession/week";
import { getFreeLimitBlock } from "@/lib/weeklySession/freeTier";

// Confirm-screen revision step: takes the current classified plan plus a
// natural-language change and returns the revised plan. It does NOT touch
// the calendar or weekly_items -- the client re-runs /propose on the
// returned actions to get fresh blocks, so scheduling stays in one place
// (src/lib/planning/blocks.ts). Same "any request body is untrusted" stance
// as the rest of the weekly-session routes.
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as {
    actions?: unknown;
    message?: unknown;
    timeZone?: unknown;
  } | null;

  if (
    !body ||
    typeof body.message !== "string" ||
    !body.message.trim() ||
    !Array.isArray(body.actions) ||
    !body.actions.every(isClassifiedAction)
  ) {
    return NextResponse.json(
      {
        error:
          "Body must include a non-empty string `message` and `actions: {role, description, type, cadenceCount?, preferredTime?}[]`.",
      },
      { status: 400 },
    );
  }

  // Freemium gate (see freeTier.ts getFreeLimitBlock): this route takes the
  // plan from the request body, so it must not let a free user at the
  // limit drive a brand-new week without a /step session. In-progress
  // rounds and addendum weeks pass straight through.
  try {
    const freeLimit = await getFreeLimitBlock(
      supabase,
      user.id,
      await getWeeklySessionTranscript(
        supabase,
        user.id,
        planningWeekStart(
          new Date(),
          typeof body.timeZone === "string" ? body.timeZone : undefined,
        ),
      ),
    );
    if (freeLimit) {
      return NextResponse.json(freeLimit, { status: 402 });
    }
  } catch (error) {
    console.error("[weekly-session/revise] free-tier check failed:", error);
    return NextResponse.json({ error: "Couldn't check your plan. Try again." }, { status: 500 });
  }

  try {
    const result = await revisePlan({
      actions: body.actions,
      message: body.message,
      userId: user.id,
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error("Plan revision failed:", error);
    return NextResponse.json(
      { error: "Sundae had trouble with that change — try rewording it." },
      { status: 502 },
    );
  }
}
