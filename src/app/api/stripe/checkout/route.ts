import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getStripe } from "@/lib/stripe/client";
import { getAppUrl } from "@/lib/appUrl";
import { captureServerEvent } from "@/lib/analytics/server";
import {
  buildSubscriptionCheckoutParams,
  canPersistPendingCheckoutRow,
  hasOpenStripeSubscription,
  pickStripeCustomerForUser,
  shouldBlockNewCheckout,
  stripeCustomerBelongsToUser,
  type RetrievedStripeCustomer,
  type StripeCustomerLike,
} from "@/lib/stripe/checkout";

export type CheckoutStripeClient = {
  customers: {
    retrieve(customerId: string): Promise<RetrievedStripeCustomer>;
    list(params: { email: string; limit: number }): Promise<{ data: StripeCustomerLike[] }>;
    create(params: { email?: string; metadata: Record<string, string> }): Promise<{ id: string }>;
  };
  subscriptions: {
    list(params: {
      customer: string;
      status: "all";
      limit: number;
    }): Promise<{ data: Array<{ status: string }> }>;
  };
  checkout: {
    sessions: {
      // Its argument is buildSubscriptionCheckoutParams(...), which is unit
      // tested for shape; typed from the builder so the seam stays honest
      // without a cast at the call site.
      create(params: ReturnType<typeof buildSubscriptionCheckoutParams>): Promise<{
        url?: string | null;
      }>;
    };
  };
  billingPortal: {
    sessions: {
      create(params: { customer: string; return_url: string }): Promise<{ url?: string | null }>;
    };
  };
};

export type RouteResult = { status: number; body: Record<string, unknown> };

type SupabaseServer = Awaited<ReturnType<typeof createClient>>;

export async function POST(request: Request) {
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
      user.id,
    );
    return NextResponse.json(
      {
        error: "You already have an active subscription.",
        code: "already_subscribed",
        ...(portalUrl ? { portalUrl } : {}),
      },
      { status: 409 },
    );
  }

  const fromLimit = new URL(request.url).searchParams.get("from") === "limit";
  const result = await runCheckout({
    stripe: getStripe(),
    supabase,
    user: { id: user.id, email: user.email ?? null },
    appUrl: getAppUrl().replace(/\/$/, ""),
    priceId,
    fromLimit,
    existing: existing ?? null,
    capture: captureServerEvent,
  });
  return NextResponse.json(result.body, { status: result.status });
}

export async function runCheckout(input: {
  stripe: CheckoutStripeClient;
  supabase: SupabaseServer;
  user: { id: string; email: string | null };
  appUrl: string;
  priceId: string;
  fromLimit: boolean;
  existing: {
    status: string | null;
    stripe_customer_id: string | null;
    updated_at: string | null;
  } | null;
  capture: (input: {
    distinctId: string;
    event: string;
    properties?: Record<string, unknown>;
  }) => Promise<void>;
}): Promise<RouteResult> {
  const { stripe, supabase, user, appUrl, priceId, fromLimit, existing, capture } = input;

  const storedCustomerId =
    typeof existing?.stripe_customer_id === "string" && existing.stripe_customer_id
      ? existing.stripe_customer_id
      : null;

  const { customerId, bindingTrusted } = await resolveCheckoutCustomerId(
    stripe,
    storedCustomerId,
    user.id,
    user.email,
  );

  // Never hand Stripe Checkout a customer_email-only session.
  if (!customerId) {
    return { status: 500, body: { error: "Couldn't create a billing customer." } };
  }

  const listed = await stripe.subscriptions.list({
    customer: customerId,
    status: "all",
    limit: 100,
  });
  if (hasOpenStripeSubscription(listed.data.map((s) => s.status))) {
    const portalUrl = await portalUrlForCustomer(stripe, customerId, user.id);
    return {
      status: 409,
      body: {
        error: "There's already a subscription on this account. Manage billing to update or cancel it.",
        code: "already_subscribed",
        ...(portalUrl ? { portalUrl } : {}),
      },
    };
  }

  // Persist incomplete before sessions.create (first-time, expired checkout,
  // and resubscribe after canceled/past_due). Open Stripe subs already 409'd
  // above. trialing (legacy) / active never reach here.
  const existingStatus = typeof existing?.status === "string" ? existing.status : null;
  if (canPersistPendingCheckoutRow(existingStatus)) {
    if (!bindingTrusted) {
      // The row's stored stripe_customer_id is not this user's, and
      // `authenticated` may not rewrite it (the
      // subscriptions_lock_customer_binding trigger). Skip the upsert and
      // continue with the fresh customer; the webhook (service role)
      // reconciles the row from checkout.session.completed metadata.
      console.warn(
        "[stripe/checkout] stored billing customer is not owned by user; skipping pending-row write",
        { userId: user.id },
      );
    } else {
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
        return { status: 500, body: { error: "Couldn't start checkout." } };
      }
    }
  }

  let session;
  try {
    session = await stripe.checkout.sessions.create(
      buildSubscriptionCheckoutParams({
        customerId,
        priceId,
        userId: user.id,
        appUrl,
      }),
    );
  } catch (err) {
    console.error("[stripe/checkout] sessions.create failed:", err);
    await releaseIncompleteLock(supabase, user.id);
    return { status: 500, body: { error: "Couldn't start checkout." } };
  }

  if (!session.url) {
    await releaseIncompleteLock(supabase, user.id);
    return { status: 500, body: { error: "Stripe did not return a checkout URL." } };
  }

  // `?from=limit` (the free-limit card's button) is analytics-only; no
  // behavior change. Captured server-side so ad blockers can't drop it.
  try {
    await capture({
      distinctId: user.id,
      event: fromLimit ? "upgrade_clicked" : "checkout_started",
      properties: { from: fromLimit ? "limit" : "subscribe" },
    });
  } catch (err) {
    console.error("[stripe/checkout] checkout_started analytics failed:", err);
  }

  return { status: 200, body: { url: session.url } };
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

export async function portalUrlForCustomer(
  stripe: CheckoutStripeClient,
  customerId: string | null,
  userId: string,
): Promise<string | null> {
  if (!customerId) return null;
  if (!(await customerIsOwnedByUser(stripe, customerId, userId))) return null;
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

// Fail closed: a retrieve error means "not proven ours".
async function customerIsOwnedByUser(
  stripe: CheckoutStripeClient,
  customerId: string,
  userId: string,
): Promise<boolean> {
  try {
    const customer = await stripe.customers.retrieve(customerId);
    if (stripeCustomerBelongsToUser(customer, userId)) return true;
  } catch (err) {
    console.warn("[stripe/checkout] could not verify billing customer ownership:", err);
    return false;
  }
  console.warn("[stripe/checkout] stored billing customer is not owned by user", { userId });
  return false;
}

export async function resolveCheckoutCustomerId(
  stripe: CheckoutStripeClient,
  storedCustomerId: string | null,
  userId: string,
  email: string | null,
): Promise<{ customerId: string | null; bindingTrusted: boolean }> {
  if (!storedCustomerId) {
    return {
      customerId: await findOrCreateStripeCustomer(stripe, userId, email),
      bindingTrusted: true,
    };
  }
  if (await customerIsOwnedByUser(stripe, storedCustomerId, userId)) {
    return { customerId: storedCustomerId, bindingTrusted: true };
  }
  // Never return the unverified id: mint a fresh customer for this user.
  return {
    customerId: await findOrCreateStripeCustomer(stripe, userId, email),
    bindingTrusted: false,
  };
}

export async function findOrCreateStripeCustomer(
  stripe: CheckoutStripeClient,
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
