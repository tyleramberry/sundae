import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { revisePlan } from "@/lib/engine/revisePlan";
import { isClassifiedAction } from "@/lib/weeklySession/parseActions";
import type { ClassifiedAction } from "@/lib/engine/weeklySessionTypes";

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

  try {
    const result = await revisePlan({
      actions: body.actions,
      message: body.message,
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
