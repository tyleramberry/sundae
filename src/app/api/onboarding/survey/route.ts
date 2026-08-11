import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  getOnboardingSurveyAnswers,
  saveOnboardingSurveyAnswers,
} from "@/lib/onboardingSurvey/persist";

// GET: lets the onboarding UI resume mid-survey (e.g. a refresh) instead of
// starting over.
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const existing = await getOnboardingSurveyAnswers(supabase, user.id);
  return NextResponse.json({ answers: existing });
}

// POST: patches whichever survey fields the current screen just collected.
// Called once per screen (not just at the end) so a drop-off before the
// demo/hype screens still leaves real funnel data -- see the migration's
// file header.
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as {
    heardFrom?: unknown;
    weeklyRoles?: unknown;
    goalsForSundae?: unknown;
    demoGoalText?: unknown;
  } | null;

  if (!body) {
    return NextResponse.json({ error: "Body must be valid JSON." }, { status: 400 });
  }

  const isStringArray = (v: unknown): v is string[] =>
    Array.isArray(v) && v.every((x) => typeof x === "string");

  if (
    (body.heardFrom !== undefined && typeof body.heardFrom !== "string") ||
    (body.weeklyRoles !== undefined && !isStringArray(body.weeklyRoles)) ||
    (body.goalsForSundae !== undefined && !isStringArray(body.goalsForSundae)) ||
    (body.demoGoalText !== undefined && typeof body.demoGoalText !== "string")
  ) {
    return NextResponse.json(
      {
        error:
          "Fields must be: heardFrom?: string, weeklyRoles?: string[], goalsForSundae?: string[], demoGoalText?: string.",
      },
      { status: 400 },
    );
  }

  await saveOnboardingSurveyAnswers(supabase, {
    userId: user.id,
    heardFrom: body.heardFrom as string | undefined,
    weeklyRoles: body.weeklyRoles as string[] | undefined,
    goalsForSundae: body.goalsForSundae as string[] | undefined,
    demoGoalText: body.demoGoalText as string | undefined,
  });

  return NextResponse.json({ ok: true });
}
