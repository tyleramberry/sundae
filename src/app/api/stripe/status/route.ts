import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getStripe } from "@/lib/stripe/client";
import {
  checkoutSessionBelongsToUser,
  stripeSubscriptionIsLive,
} from "@/lib/stripe/checkout";
import { stripeExpandableId } from "@/lib/stripe/webhook";
import { isSubscriptionEntitled, type SubscriptionRow } from "@/lib/trial";

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const { data: sub, error } = await supabase
    .from("subscriptions")
    .select(
      "id, user_id, stripe_customer_id, stripe_subscription_id, status, trial_end, current_period_end, cancel_at_period_end, created_at, updated_at",
    )
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    console.error("[stripe/status] failed to load subscription:", error);
    return NextResponse.json({ error: "Couldn't load billing status." }, { status: 500 });
  }

  const row = sub as SubscriptionRow | null;
  let entitled = isSubscriptionEntitled(row);
  let status = row?.status ?? null;

  const sessionId = new URL(request.url).searchParams.get("session_id");
  if (!entitled && sessionId && process.env.STRIPE_SECRET_KEY) {
    try {
      const stripe = getStripe();
      const session = await stripe.checkout.sessions.retrieve(sessionId);
      const customerId = row?.stripe_customer_id ?? null;
      if (checkoutSessionBelongsToUser(session, user.id, customerId)) {
        const subscriptionId = stripeExpandableId(
          session.subscription as string | { id: string } | null,
        );
        if (subscriptionId) {
          const subscription = await stripe.subscriptions.retrieve(subscriptionId);
          if (stripeSubscriptionIsLive(subscription.status)) {
            entitled = true;
            status = subscription.status;
          }
        }
      }
    } catch (err) {
      console.warn("[stripe/status] checkout session retrieve failed:", err);
    }
  }

  return NextResponse.json({ entitled, status });
}
