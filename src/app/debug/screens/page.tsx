import OnboardingPage from "@/app/onboarding/page";
import SubscribeCheckout from "@/app/subscribe/SubscribeCheckout";
import { FREE_SESSION_LIMIT } from "@/lib/weeklySession/freeTier";

// Dev-only visual preview of the signed-out / pre-app screens, without
// needing a seeded account or a real Stripe session. Renders the real
// components; anything they POST fails auth harmlessly (onboarding's survey
// saves are fire-and-forget). Don't click the onboarding's final button --
// it navigates to /weekly-session, which needs a session.
//
//   /debug/screens?s=onboarding
//   /debug/screens?s=subscribe | resubscribe | canceled | limit | confirming
export default async function DebugScreens({
  searchParams,
}: {
  searchParams: Promise<{ s?: string }>;
}) {
  const { s = "onboarding" } = await searchParams;

  if (s === "onboarding") return <OnboardingPage />;

  return (
    <SubscribeCheckout
      resubscribe={s === "resubscribe"}
      limitReached={s === "limit"}
      freeLimit={FREE_SESSION_LIMIT}
      checkoutCanceled={s === "canceled"}
      checkoutSuccess={s === "confirming"}
      checkoutSessionId={null}
    />
  );
}
