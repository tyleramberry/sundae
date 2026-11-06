import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isBillingEnforced, isSubscriptionEntitled, type SubscriptionRow } from "@/lib/billing";
import {
  countCompletedSessions,
  FREE_SESSION_LIMIT,
  getFreeTierAccess,
} from "@/lib/weeklySession/freeTier";
import SubscribeCheckout from "./SubscribeCheckout";

// Freemium: the upgrade page, not a gate -- nothing redirects here for a
// missing subscription anymore. Lives outside the (app) shell so Checkout
// success can land here and poll until the webhook entitles the user, then
// send them to /weekly-session (where the free limit blocked them).
export default async function SubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string; checkout?: string; session_id?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/subscribe");
  }

  const params = await searchParams;
  const checkoutCanceled = params.checkout === "canceled";
  const checkoutSuccess = params.checkout === "success";

  const { data: sub } = await supabase
    .from("subscriptions")
    .select(
      "id, user_id, stripe_customer_id, stripe_subscription_id, status, trial_end, current_period_end, cancel_at_period_end, created_at, updated_at",
    )
    .eq("user_id", user.id)
    .maybeSingle();

  // cancel_url lands here even if the client never clicks — clear the
  // in-flight incomplete lock so they can start Checkout again immediately.
  if (checkoutCanceled && sub?.status === "incomplete") {
    await supabase
      .from("subscriptions")
      .update({
        status: "incomplete_expired",
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", user.id)
      .eq("status", "incomplete");
  }

  if (isSubscriptionEntitled(sub as SubscriptionRow | null)) {
    // Keep checkout=success on the redirect so Meta Subscribe can fire when
    // the webhook already entitled the user before this page rendered (the
    // confirming UI never mounts in that case) -- see MetaEvents.tsx.
    redirect(checkoutSuccess ? "/weekly-session?checkout=success" : "/dashboard");
  }

  const pendingCheckout = checkoutSuccess && sub?.status === "incomplete";

  // Only show the "you've used your free sessions" card when it's true --
  // the sidebar's Upgrade link sends free users here at any count.
  let limitReached = false;
  if (isBillingEnforced() && !pendingCheckout) {
    try {
      const completedSessions = await countCompletedSessions(supabase, user.id);
      limitReached = !getFreeTierAccess({
        subscription: sub as SubscriptionRow | null,
        completedSessions,
      }).canStartNewSession;
    } catch (err) {
      console.error("[subscribe] free-tier check failed:", err);
    }
  }

  return (
    <SubscribeCheckout
      resubscribe={params.reason === "resubscribe"}
      limitReached={limitReached}
      freeLimit={FREE_SESSION_LIMIT}
      checkoutCanceled={checkoutCanceled}
      checkoutSuccess={pendingCheckout}
      checkoutSessionId={params.session_id ?? null}
    />
  );
}
