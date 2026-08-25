import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe/client";
import type { MappedSubscriptionFields } from "@/lib/stripe/webhook";
import {
  constructVerifiedStripeEvent,
  isHandledStripeEvent,
  mapStripeSubscriptionToRow,
  stripeExpandableId,
  StripeWebhookSignatureError,
  type StripeSubscriptionLike,
} from "@/lib/stripe/webhook";

// Webhooks need the raw body for signature verification. Node runtime
// (not Edge) so request.text() is the unmodified payload Stripe signed.
export const runtime = "nodejs";

export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "STRIPE_WEBHOOK_SECRET is not set." },
      { status: 500 },
    );
  }

  const rawBody = await request.text();
  const signature = request.headers.get("stripe-signature");

  let event: Stripe.Event;
  try {
    event = constructVerifiedStripeEvent(
      getStripe(),
      rawBody,
      signature,
      secret,
    ) as Stripe.Event;
  } catch (err) {
    if (err instanceof StripeWebhookSignatureError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    const message = err instanceof Error ? err.message : "Webhook verification failed.";
    // Missing secret is already handled above; any other construct failure
    // is a signature problem from Stripe's point of view.
    return NextResponse.json({ error: message }, { status: 400 });
  }

  if (!isHandledStripeEvent(event.type)) {
    return NextResponse.json({ received: true, ignored: event.type });
  }

  const stripe = getStripe();
  const admin = createAdminClient();

  try {
    if (event.type === "checkout.session.completed") {
      await handleCheckoutCompleted(stripe, admin, event.data.object as Stripe.Checkout.Session);
    } else if (event.type === "customer.subscription.updated") {
      await handleSubscriptionUpdated(stripe, admin, event.data.object as Stripe.Subscription);
    } else if (event.type === "customer.subscription.deleted") {
      await handleSubscriptionDeleted(admin, event.data.object as Stripe.Subscription);
    }
  } catch (err) {
    console.error(`[stripe/webhook] failed to handle ${event.type}:`, err);
    return NextResponse.json({ error: "Webhook handler failed." }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

type AdminClient = ReturnType<typeof createAdminClient>;

async function handleCheckoutCompleted(
  stripe: Stripe,
  admin: AdminClient,
  session: Stripe.Checkout.Session,
): Promise<void> {
  const subscriptionId = stripeExpandableId(
    session.subscription as string | { id: string } | null,
  );
  if (!subscriptionId) {
    console.warn("[stripe/webhook] checkout.session.completed without subscription id");
    return;
  }

  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const userId = await resolveUserId(stripe, admin, {
    fromMetadata:
      session.metadata?.supabase_user_id ??
      session.client_reference_id ??
      subscription.metadata?.supabase_user_id ??
      null,
    customerId: stripeExpandableId(session.customer as string | { id: string } | null),
    subscriptionId,
  });

  if (!userId) {
    console.warn(
      "[stripe/webhook] checkout.session.completed could not map to a user; acknowledging",
    );
    return;
  }

  const mapped = mapStripeSubscriptionToRow(subscription as StripeSubscriptionLike, userId);
  if (!mapped) {
    console.warn("[stripe/webhook] checkout.session.completed missing customer id; acknowledging");
    return;
  }

  await upsertSubscription(admin, mapped);
}

async function handleSubscriptionUpdated(
  stripe: Stripe,
  admin: AdminClient,
  subscription: Stripe.Subscription,
): Promise<void> {
  const customerId = stripeExpandableId(subscription.customer as string | { id: string } | null);
  const userId = await resolveUserId(stripe, admin, {
    fromMetadata: subscription.metadata?.supabase_user_id ?? null,
    customerId,
    subscriptionId: subscription.id,
  });

  if (!userId) {
    console.warn(
      "[stripe/webhook] customer.subscription.updated could not map to a user; acknowledging",
    );
    return;
  }

  const mapped = mapStripeSubscriptionToRow(subscription as StripeSubscriptionLike, userId);
  if (!mapped) {
    console.warn("[stripe/webhook] customer.subscription.updated missing customer id; acknowledging");
    return;
  }

  await upsertSubscription(admin, mapped);
}

async function handleSubscriptionDeleted(
  admin: AdminClient,
  subscription: Stripe.Subscription,
): Promise<void> {
  const { data: existing } = await admin
    .from("subscriptions")
    .select("user_id")
    .eq("stripe_subscription_id", subscription.id)
    .maybeSingle();

  if (!existing) {
    const customerId = stripeExpandableId(subscription.customer as string | { id: string } | null);
    if (customerId) {
      const { error } = await admin
        .from("subscriptions")
        .update({
          status: "canceled",
          cancel_at_period_end: false,
          updated_at: new Date().toISOString(),
        })
        .eq("stripe_customer_id", customerId);
      if (error) throw error;
      return;
    }
    console.warn(
      "[stripe/webhook] customer.subscription.deleted with no matching row; acknowledging",
    );
    return;
  }

  const { error } = await admin
    .from("subscriptions")
    .update({
      status: "canceled",
      cancel_at_period_end: false,
      updated_at: new Date().toISOString(),
    })
    .eq("stripe_subscription_id", subscription.id);

  if (error) throw error;
}

async function resolveUserId(
  stripe: Stripe,
  admin: AdminClient,
  ids: { fromMetadata: string | null; customerId: string | null; subscriptionId: string },
): Promise<string | null> {
  if (ids.fromMetadata) return ids.fromMetadata;

  const { data: bySub } = await admin
    .from("subscriptions")
    .select("user_id")
    .eq("stripe_subscription_id", ids.subscriptionId)
    .maybeSingle();
  if (bySub?.user_id) return bySub.user_id as string;

  if (ids.customerId) {
    const { data: byCustomer } = await admin
      .from("subscriptions")
      .select("user_id")
      .eq("stripe_customer_id", ids.customerId)
      .maybeSingle();
    if (byCustomer?.user_id) return byCustomer.user_id as string;

    try {
      const customer = await stripe.customers.retrieve(ids.customerId);
      if (!("deleted" in customer && customer.deleted) && customer.metadata?.supabase_user_id) {
        return customer.metadata.supabase_user_id;
      }
    } catch (err) {
      console.warn("[stripe/webhook] customer retrieve failed:", err);
    }
  }

  return null;
}

async function upsertSubscription(admin: AdminClient, row: MappedSubscriptionFields): Promise<void> {
  const payload = {
    ...row,
    updated_at: new Date().toISOString(),
  };

  const { error } = await admin.from("subscriptions").upsert(payload, { onConflict: "user_id" });
  if (!error) return;

  const retry = await admin
    .from("subscriptions")
    .upsert(payload, { onConflict: "stripe_subscription_id" });
  if (retry.error) throw retry.error;
}
