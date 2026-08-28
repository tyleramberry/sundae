import type { SupabaseClient } from "@supabase/supabase-js";

export type OnboardingSurveyRow = {
  user_id: string;
  heard_from: string | null;
  weekly_roles: string[];
  goals_for_sundae: string[];
  demo_goal_text: string | null;
  completed_at?: string | null;
  created_at: string;
  updated_at: string;
};

export type SaveOnboardingSurveyInput = {
  userId: string;
  heardFrom?: string;
  weeklyRoles?: string[];
  goalsForSundae?: string[];
  demoGoalText?: string;
  completed?: boolean;
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

  const now = new Date().toISOString();
  // Only send completed_at when marking the flow done. Incremental screen
  // saves omit it so (a) an in-progress upsert can't clobber a timestamp
  // already stored and (b) survey POSTs keep working if this column hasn't
  // been migrated yet -- routing still treats demo_goal_text as complete.
  const row: {
    user_id: string;
    heard_from: string | null;
    weekly_roles: string[];
    goals_for_sundae: string[];
    demo_goal_text: string | null;
    updated_at: string;
    completed_at?: string;
  } = {
    user_id: input.userId,
    heard_from: input.heardFrom ?? existing?.heard_from ?? null,
    weekly_roles: input.weeklyRoles ?? existing?.weekly_roles ?? [],
    goals_for_sundae: input.goalsForSundae ?? existing?.goals_for_sundae ?? [],
    demo_goal_text: input.demoGoalText ?? existing?.demo_goal_text ?? null,
    updated_at: now,
  };
  if (input.completed) {
    row.completed_at = existing?.completed_at ?? now;
  }

  const { error } = await supabase.from("onboarding_survey").upsert(row, {
    onConflict: "user_id",
  });

  if (error && input.completed && "completed_at" in row) {
    // Column may not be migrated yet. Persist the rest of the row so
    // demo_goal_text still marks the flow complete on the next login.
    console.error(
      "Failed to set onboarding_survey.completed_at, retrying without it:",
      error.message,
    );
    delete row.completed_at;
    const retry = await supabase.from("onboarding_survey").upsert(row, {
      onConflict: "user_id",
    });
    if (retry.error) {
      throw new Error(`Failed to save onboarding survey answers: ${retry.error.message}`);
    }
    return;
  }

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
