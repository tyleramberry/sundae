import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe/client";
import {
  constructVerifiedStripeEvent,
  isHandledStripeEvent,
  mapStripeSubscriptionToRow,
  stripeExpandableId,
  StripeWebhookSignatureError,
  upsertSubscriptionRow,
  type StripeSubscriptionLike,
} from "@/lib/stripe/webhook";
import { captureServerEvent } from "@/lib/analytics/server";
import {
  isTrialConvertedToActive,
  type SubscriptionPreviousAttributes,
} from "@/lib/analytics/trialConvert";
import { sendMetaSubscribeEvent } from "@/lib/meta/capi";

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
      const previous = event.data.previous_attributes as
        | SubscriptionPreviousAttributes
        | undefined;
      await handleSubscriptionUpdated(
        stripe,
        admin,
        event.data.object as Stripe.Subscription,
        previous,
      );
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

  const upserted = await upsertSubscriptionRow(admin, mapped);
  // Freemium: checkout charges immediately, so a completed checkout with an
  // active subscription is the paid conversion. (A payment that needs
  // extra auth lands here as `incomplete` and is counted when
  // customer.subscription.updated flips it to active.)
  if (upserted && mapped.status === "active") {
    await recordPaidSubscriptionStarted(admin, userId, subscription.id);
  }
}

async function recordPaidSubscriptionStarted(
  admin: AdminClient,
  userId: string,
  subscriptionId: string,
): Promise<void> {
  try {
    await captureServerEvent({
      distinctId: userId,
      event: "subscription_started",
      properties: { status: "active" },
    });
  } catch (err) {
    console.error("[stripe/webhook] subscription_started analytics failed:", err);
  }

  try {
    const { data: userResult } = await admin.auth.admin.getUserById(userId);
    // eventId = subscription id, same as the legacy trial→paid path, so
    // Meta dedupes if both ever fire for one subscription.
    await sendMetaSubscribeEvent({
      email: userResult?.user?.email ?? null,
      eventId: subscriptionId,
    });
  } catch (err) {
    console.error("[stripe/webhook] Meta CAPI Subscribe failed:", err);
  }
}

async function handleSubscriptionUpdated(
  stripe: Stripe,
  admin: AdminClient,
  subscription: Stripe.Subscription,
  previousAttributes: SubscriptionPreviousAttributes | undefined,
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

  const upserted = await upsertSubscriptionRow(admin, mapped);
  if (!upserted) return;

  // Freemium checkout whose first payment needed extra auth: incomplete →
  // active is the paid conversion checkout.session.completed couldn't see.
  if (mapped.status === "active" && previousAttributes?.status === "incomplete") {
    await recordPaidSubscriptionStarted(admin, userId, subscription.id);
    return;
  }

  // Legacy (dormant): pre-freemium card-backed trials converting to paid.
  // No new trials are created; delete with trialConvert.ts once the last
  // existing trial_end has passed.
  if (isTrialConvertedToActive(mapped.status, previousAttributes)) {
    try {
      await captureServerEvent({
        distinctId: userId,
        event: "trial_converted",
        properties: { status: mapped.status },
      });
    } catch (err) {
      console.error("[stripe/webhook] trial_converted analytics failed:", err);
    }

    try {
      const { data: userResult } = await admin.auth.admin.getUserById(userId);
      await sendMetaSubscribeEvent({
        email: userResult?.user?.email ?? null,
        eventId: subscription.id,
      });
    } catch (err) {
      console.error("[stripe/webhook] Meta CAPI Subscribe failed:", err);
    }
  }
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
    console.warn(
      "[stripe/webhook] customer.subscription.deleted with no matching subscription id; acknowledging",
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

  try {
    await captureServerEvent({
      distinctId: existing.user_id as string,
      event: "subscription_canceled",
    });
  } catch (err) {
    console.error("[stripe/webhook] subscription_canceled analytics failed:", err);
  }
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
