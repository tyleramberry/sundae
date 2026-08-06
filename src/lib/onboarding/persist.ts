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
