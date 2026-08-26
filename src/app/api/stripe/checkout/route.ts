import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getStripe } from "@/lib/stripe/client";
import { getAppUrl } from "@/lib/appUrl";
import {
  canPersistPendingCheckoutRow,
  hasOpenStripeSubscription,
  isStripeMissingCustomerError,
  pickStripeCustomerForUser,
  shouldBlockNewCheckout,
} from "@/lib/stripe/checkout";

export async function POST() {
  const secret = process.env.STRIPE_SECRET_KEY;
  const priceId = process.env.STRIPE_PRICE_ID;
  if (!secret || !priceId) {
    return NextResponse.json(
      { error: "Billing is not configured (STRIPE_SECRET_KEY / STRIPE_PRICE_ID)." },
      { status: 500 },
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const { data: existing, error: existingError } = await supabase
    .from("subscriptions")
    .select("status, stripe_customer_id, updated_at")
    .eq("user_id", user.id)
    .maybeSingle();

  if (existingError) {
    console.error("[stripe/checkout] failed to load subscription:", existingError);
    return NextResponse.json({ error: "Couldn't load billing status." }, { status: 500 });
  }

  if (shouldBlockNewCheckout(existing)) {
    const inFlight = existing?.status === "incomplete";
    if (inFlight) {
      return NextResponse.json(
        {
          error: "Checkout is already in progress. Wait a moment and try again.",
          code: "in_flight",
        },
        { status: 409 },
      );
    }
    const stripe = getStripe();
    const portalUrl = await portalUrlForCustomer(
      stripe,
      typeof existing?.stripe_customer_id === "string" ? existing.stripe_customer_id : null,
    );
    return NextResponse.json(
      {
        error: "You already have an active trial or subscription.",
        code: "already_subscribed",
        ...(portalUrl ? { portalUrl } : {}),
      },
      { status: 409 },
    );
  }

  const stripe = getStripe();
  const appUrl = getAppUrl().replace(/\/$/, "");

  let customerId =
    typeof existing?.stripe_customer_id === "string" && existing.stripe_customer_id
      ? existing.stripe_customer_id
      : null;

  if (!customerId) {
    customerId = await findOrCreateStripeCustomer(stripe, user.id, user.email ?? null);
  }

  // Never hand Stripe Checkout a customer_email-only session: we persist
  // stripe_customer_id on the incomplete row before returning the URL.
  if (!customerId) {
    return NextResponse.json({ error: "Couldn't create a billing customer." }, { status: 500 });
  }

  let listed;
  try {
    listed = await stripe.subscriptions.list({
      customer: customerId,
      status: "all",
      limit: 100,
    });
  } catch (err) {
    if (!isStripeMissingCustomerError(err)) {
      console.error("[stripe/checkout] subscriptions.list failed:", err);
      return NextResponse.json({ error: "Couldn't start checkout." }, { status: 500 });
    }
    // Test-mode (or deleted) customer IDs 404 after switching to live keys.
    console.warn("[stripe/checkout] stored customer missing in Stripe; creating a new one");
    customerId = await findOrCreateStripeCustomer(stripe, user.id, user.email ?? null);
    if (!customerId) {
      return NextResponse.json({ error: "Couldn't create a billing customer." }, { status: 500 });
    }
    listed = await stripe.subscriptions.list({
      customer: customerId,
      status: "all",
      limit: 100,
    });
  }
  if (hasOpenStripeSubscription(listed.data.map((s) => s.status))) {
    const portalUrl = await portalUrlForCustomer(stripe, customerId);
    return NextResponse.json(
      {
        error: "There's already a subscription on this account. Manage billing to update or cancel it.",
        code: "already_subscribed",
        ...(portalUrl ? { portalUrl } : {}),
      },
      { status: 409 },
    );
  }

  // Persist incomplete before sessions.create (first-time, expired checkout,
  // and resubscribe after canceled/past_due). Open Stripe subs already 409'd
  // above. trialing/active never reach here.
  const existingStatus = typeof existing?.status === "string" ? existing.status : null;
  if (canPersistPendingCheckoutRow(existingStatus)) {
    const pending = {
      user_id: user.id,
      stripe_customer_id: customerId,
      stripe_subscription_id: null,
      status: "incomplete",
      cancel_at_period_end: false,
      updated_at: new Date().toISOString(),
    };

    const { error: persistError } = await supabase
      .from("subscriptions")
      .upsert(pending, { onConflict: "user_id" });

    if (persistError) {
      console.error("[stripe/checkout] failed to persist incomplete row:", persistError);
      return NextResponse.json({ error: "Couldn't start checkout." }, { status: 500 });
    }
  }

  let session;
  try {
    session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      subscription_data: {
        trial_period_days: 7,
        metadata: { supabase_user_id: user.id },
      },
      success_url: `${appUrl}/subscribe?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/subscribe?checkout=canceled`,
      client_reference_id: user.id,
      metadata: { supabase_user_id: user.id },
      payment_method_collection: "always",
    });
  } catch (err) {
    console.error("[stripe/checkout] sessions.create failed:", err);
    await releaseIncompleteLock(supabase, user.id);
    return NextResponse.json({ error: "Couldn't start checkout." }, { status: 500 });
  }

  if (!session.url) {
    await releaseIncompleteLock(supabase, user.id);
    return NextResponse.json({ error: "Stripe did not return a checkout URL." }, { status: 500 });
  }

  return NextResponse.json({ url: session.url });
}

async function releaseIncompleteLock(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<void> {
  const { error } = await supabase
    .from("subscriptions")
    .update({
      status: "incomplete_expired",
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .eq("status", "incomplete");
  if (error) {
    console.error("[stripe/checkout] failed to release incomplete lock:", error);
  }
}

async function portalUrlForCustomer(
  stripe: ReturnType<typeof getStripe>,
  customerId: string | null,
): Promise<string | null> {
  if (!customerId) return null;
  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${getAppUrl().replace(/\/$/, "")}/subscribe`,
    });
    return session.url ?? null;
  } catch (err) {
    console.error("[stripe/checkout] failed to create portal session:", err);
    return null;
  }
}

async function findOrCreateStripeCustomer(
  stripe: ReturnType<typeof getStripe>,
  userId: string,
  email: string | null,
): Promise<string | null> {
  if (email) {
    const listed = await stripe.customers.list({ email, limit: 10 });
    const matchId = pickStripeCustomerForUser(listed.data, userId);
    if (matchId) return matchId;
  }

  const created = await stripe.customers.create({
    ...(email ? { email } : {}),
    metadata: { supabase_user_id: userId },
  });
  return created.id;
}
