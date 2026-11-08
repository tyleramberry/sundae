import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getStripe } from "@/lib/stripe/client";
import { getAppUrl } from "@/lib/appUrl";
import {
  stripeCustomerBelongsToUser,
  type RetrievedStripeCustomer,
} from "@/lib/stripe/checkout";

export type PortalStripeClient = {
  customers: { retrieve(customerId: string): Promise<RetrievedStripeCustomer> };
  billingPortal: {
    sessions: {
      create(params: { customer: string; return_url: string }): Promise<{ url?: string | null }>;
    };
  };
};

export type RouteResult = { status: number; body: Record<string, unknown> };

// M3 (SEC-1): subscriptions.stripe_customer_id is client-writable, so it is
// never trusted on its own — the Stripe Customer must be tagged as this user
// before a billing portal session is created for it. Fails closed.
export async function openBillingPortal(input: {
  stripe: PortalStripeClient;
  customerId: string;
  userId: string;
  appUrl: string;
}): Promise<RouteResult> {
  const { stripe, customerId, userId, appUrl } = input;

  let customer: RetrievedStripeCustomer;
  try {
    customer = await stripe.customers.retrieve(customerId);
  } catch (err) {
    console.error("[stripe/portal] failed to retrieve customer:", err);
    return { status: 502, body: { error: "Couldn't reach Stripe. Try again shortly." } };
  }

  if (!stripeCustomerBelongsToUser(customer, userId)) {
    console.warn("[stripe/portal] stored billing customer is not owned by user; refusing", {
      userId,
    });
    return {
      status: 403,
      body: { error: "That billing customer isn't linked to your account." },
    };
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${appUrl}/dashboard`,
  });

  if (!session.url) {
    return { status: 500, body: { error: "Stripe did not return a portal URL." } };
  }

  return { status: 200, body: { url: session.url } };
}

export async function POST() {
  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json(
      { error: "Billing is not configured (STRIPE_SECRET_KEY)." },
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

  const { data: sub, error } = await supabase
    .from("subscriptions")
    .select("stripe_customer_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    console.error("[stripe/portal] failed to load subscription:", error);
    return NextResponse.json({ error: "Couldn't load billing status." }, { status: 500 });
  }

  const customerId = sub?.stripe_customer_id as string | undefined;
  if (!customerId) {
    return NextResponse.json(
      { error: "No billing customer on file. Subscribe first." },
      { status: 400 },
    );
  }

  const appUrl = getAppUrl().replace(/\/$/, "");
  const result = await openBillingPortal({
    stripe: getStripe(),
    customerId,
    userId: user.id,
    appUrl,
  });
  return NextResponse.json(result.body, { status: result.status });
}
