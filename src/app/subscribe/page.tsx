import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSubscriptionEntitled, type SubscriptionRow } from "@/lib/trial";
import SubscribeCheckout from "./SubscribeCheckout";

// Lives outside the (app) route group on purpose: the signed-in shell
// redirects here when billing is missing, so putting /subscribe under
// that layout would loop. Checkout success also lands here (not on
// /dashboard) so a pending webhook cannot bounce the user through the gate.
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
    redirect("/dashboard");
  }

  const pendingCheckout = checkoutSuccess && sub?.status === "incomplete";

  return (
    <SubscribeCheckout
      resubscribe={params.reason === "resubscribe"}
      checkoutCanceled={checkoutCanceled}
      checkoutSuccess={pendingCheckout}
    />
  );
}
