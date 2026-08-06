import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getOnboardingAnswers, saveOnboardingAnswers } from "@/lib/onboarding/persist";
import type { RoleAnswer } from "@/lib/engine/types";

// GET: has this user already completed onboarding? Lets the page skip
// straight to a summary instead of re-running the conversation.
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const existing = await getOnboardingAnswers(supabase, user.id);
  return NextResponse.json({ answers: existing });
}

function isRoleAnswer(value: unknown): value is RoleAnswer {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.role === "string" &&
    Array.isArray(v.goals) &&
    v.goals.every((g) => typeof g === "string") &&
    typeof v.context === "string"
  );
}

// POST: persists the engine's `complete` action. The client sends back
// exactly the `roles`/`answers` shape the engine handed it — this route
// still validates the shape since, per the Server Actions security model,
// any request body has to be treated as untrusted regardless of where the
// UI thinks it came from.
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as {
    roles?: unknown;
    answers?: unknown;
  } | null;

  const roles = body?.roles;
  const answers = body?.answers;

  if (
    !Array.isArray(roles) ||
    !roles.every((role) => typeof role === "string") ||
    !Array.isArray(answers) ||
    !answers.every(isRoleAnswer)
  ) {
    return NextResponse.json(
      {
        error:
          "Body must include `roles: string[]` and `answers: {role, goals, context}[]`.",
      },
      { status: 400 },
    );
  }

  // Only keep answers for roles that were actually confirmed — don't trust
  // arbitrary extra entries the client body happens to include.
  const roleSet = new Set(roles);
  const cleanAnswers = answers.filter((a) => roleSet.has(a.role));

  await saveOnboardingAnswers(supabase, { userId: user.id, roles, answers: cleanAnswers });
  return NextResponse.json({ ok: true });
}
