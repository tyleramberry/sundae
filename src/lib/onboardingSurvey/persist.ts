import type { SupabaseClient } from "@supabase/supabase-js";

export type OnboardingSurveyRow = {
  user_id: string;
  heard_from: string | null;
  weekly_roles: string[];
  goals_for_sundae: string[];
  demo_goal_text: string | null;
  created_at: string;
  updated_at: string;
};

export type SaveOnboardingSurveyInput = {
  userId: string;
  heardFrom?: string;
  weeklyRoles?: string[];
  goalsForSundae?: string[];
  demoGoalText?: string;
};

// Written incrementally, one screen at a time (see the migration's file
// header for why) -- each call only patches the fields it was given, so an
// earlier screen's answer isn't clobbered by a later screen's partial
// upsert. Postgres upsert doesn't merge column-by-column on its own, so we
// read-then-merge here rather than relying on the DB to do it.
export async function saveOnboardingSurveyAnswers(
  supabase: SupabaseClient,
  input: SaveOnboardingSurveyInput,
) {
  const existing = await getOnboardingSurveyAnswers(supabase, input.userId);

  const { error } = await supabase.from("onboarding_survey").upsert(
    {
      user_id: input.userId,
      heard_from: input.heardFrom ?? existing?.heard_from ?? null,
      weekly_roles: input.weeklyRoles ?? existing?.weekly_roles ?? [],
      goals_for_sundae: input.goalsForSundae ?? existing?.goals_for_sundae ?? [],
      demo_goal_text: input.demoGoalText ?? existing?.demo_goal_text ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );

  if (error) {
    throw new Error(`Failed to save onboarding survey answers: ${error.message}`);
  }
}

export async function getOnboardingSurveyAnswers(
  supabase: SupabaseClient,
  userId: string,
): Promise<OnboardingSurveyRow | null> {
  const { data, error } = await supabase
    .from("onboarding_survey")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load onboarding survey answers: ${error.message}`);
  }

  return data;
}
