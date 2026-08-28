// Product onboarding is the /onboarding survey -> demo -> hype flow.
// Distinct from onboarding_answers, which is Stage 0 of the weekly session
// (roles/goals) and is still only written the first time a user plans.

export type OnboardingFlowSignals = {
  survey: {
    demo_goal_text?: string | null;
    completed_at?: string | null;
  } | null;
  hasOnboardingAnswers: boolean;
};

export function isProductOnboardingComplete(input: OnboardingFlowSignals): boolean {
  if (input.hasOnboardingAnswers) return true;
  if (input.survey?.completed_at) return true;
  return Boolean(input.survey?.demo_goal_text?.trim());
}

export function isOnboardingPath(path: string): boolean {
  return path === "/onboarding" || path.startsWith("/onboarding?");
}

// Default post-login destination, plus a guard so a stale ?next=/onboarding
// (the unsigned /onboarding page sends people to /login?next=/onboarding)
// cannot force a completed user back through the flow.
export function resolvePostAuthDestination(input: {
  next: string | null;
  onboardingComplete: boolean;
}): string {
  const fallback = input.onboardingComplete ? "/dashboard" : "/onboarding";
  if (!input.next) return fallback;
  if (input.onboardingComplete && isOnboardingPath(input.next)) return "/dashboard";
  return input.next;
}
