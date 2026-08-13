import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getOnboardingAnswers, updateRoleOrder } from "@/lib/onboarding/persist";

// Drag-to-reorder persistence (Day 17): reorders the same `roles` array
// /api/dashboard already reads its tile order from -- this endpoint only
// ever permutes it, it can never add, remove, or rename a role. That's
// what keeps it safe to call straight off a drag gesture with no confirm
// step, unlike the actual role-editing flows (onboarding, weekly session).
export async function PATCH(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const roles = body?.roles;

  if (!Array.isArray(roles) || roles.length === 0 || roles.some((r) => typeof r !== "string")) {
    return NextResponse.json({ error: "`roles` must be a non-empty array of strings." }, { status: 400 });
  }

  const existing = await getOnboardingAnswers(supabase, user.id);
  if (!existing) {
    return NextResponse.json({ error: "No role list to reorder yet." }, { status: 404 });
  }

  const sortedExisting = [...existing.roles].sort();
  const sortedIncoming = [...(roles as string[])].sort();
  const isSamePermutation =
    sortedExisting.length === sortedIncoming.length &&
    sortedExisting.every((r, i) => r === sortedIncoming[i]);

  if (!isSamePermutation) {
    return NextResponse.json(
      { error: "New order must contain exactly the existing roles, no more or fewer." },
      { status: 400 },
    );
  }

  await updateRoleOrder(supabase, { userId: user.id, roles });

  return NextResponse.json({ ok: true, roles });
}
