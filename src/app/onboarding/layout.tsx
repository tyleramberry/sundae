import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getOnboardingAnswers } from "@/lib/onboarding/persist";
import { getOnboardingSurveyAnswers } from "@/lib/onboardingSurvey/persist";
import { isProductOnboardingComplete } from "@/lib/onboarding/status";

// Server gate for /onboarding: first login only. Completion is stored on
// the user (onboarding_survey / onboarding_answers), not the session, so
// logout + login cannot send a finished user through this flow again.
export default async function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/onboarding");
  }

  let answers = null;
  let survey = null;
  try {
    answers = await getOnboardingAnswers(supabase, user.id);
  } catch (err) {
    console.error("[onboarding/layout] failed to read onboarding answers:", err);
  }
  try {
    survey = await getOnboardingSurveyAnswers(supabase, user.id);
  } catch (err) {
    console.error("[onboarding/layout] failed to read onboarding survey:", err);
  }

  if (
    isProductOnboardingComplete({
      survey,
      hasOnboardingAnswers: Boolean(answers),
    })
  ) {
    redirect("/dashboard");
  }

  return children;
}
