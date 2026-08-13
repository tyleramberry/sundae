import type { SupabaseClient } from "@supabase/supabase-js";
import type { RoleAnswer } from "@/lib/engine/types";

export type OnboardingAnswersRow = {
  user_id: string;
  roles: string[];
  answers: RoleAnswer[];
  completed_at: string;
  updated_at: string;
};

type SaveOnboardingAnswersInput = {
  userId: string;
  roles: string[];
  answers: RoleAnswer[];
};

// Persists the engine's `complete` action for a finished onboarding run.
// The engine itself never touches Supabase (channel-agnostic) — this is the
// web caller's job, same division as saveGoogleTokens for the calendar flow.
export async function saveOnboardingAnswers(
  supabase: SupabaseClient,
  { userId, roles, answers }: SaveOnboardingAnswersInput,
) {
  const { error } = await supabase.from("onboarding_answers").upsert(
    {
      user_id: userId,
      roles,
      answers,
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );

  if (error) {
    throw new Error(`Failed to save onboarding answers: ${error.message}`);
  }
}

type UpdateRoleOrderInput = {
  userId: string;
  roles: string[];
};

// Persists a pure reorder of the existing role list (dashboard drag-to-
// reorder, Day 17) -- never adds, removes, or renames a role, only changes
// the order they come back in, which is exactly what /api/dashboard's tile
// order already keys off of (see its `allRoles` union). Membership
// validation -- the new list must be exactly a permutation of the old one
// -- lives in the route, not here; this stays a plain persistence function
// like its siblings above.
export async function updateRoleOrder(
  supabase: SupabaseClient,
  { userId, roles }: UpdateRoleOrderInput,
) {
  const { error } = await supabase
    .from("onboarding_answers")
    .update({ roles, updated_at: new Date().toISOString() })
    .eq("user_id", userId);

  if (error) {
    throw new Error(`Failed to save role order: ${error.message}`);
  }
}

export async function getOnboardingAnswers(
  supabase: SupabaseClient,
  userId: string,
): Promise<OnboardingAnswersRow | null> {
  const { data, error } = await supabase
    .from("onboarding_answers")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load onboarding answers: ${error.message}`);
  }

  return data;
}
