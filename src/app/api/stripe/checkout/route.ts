import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getStripe } from "@/lib/stripe/client";
import { getAppUrl } from "@/lib/appUrl";

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
    .select("status, stripe_customer_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (existingError) {
    console.error("[stripe/checkout] failed to load subscription:", existingError);
    return NextResponse.json({ error: "Couldn't load billing status." }, { status: 500 });
  }

  if (existing && (existing.status === "trialing" || existing.status === "active")) {
    return NextResponse.json(
      { error: "You already have an active trial or subscription." },
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

  const sessionParams: Parameters<typeof stripe.checkout.sessions.create>[0] = {
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    subscription_data: {
      trial_period_days: 7,
      metadata: { supabase_user_id: user.id },
    },
    success_url: `${appUrl}/dashboard?checkout=success`,
    cancel_url: `${appUrl}/subscribe?checkout=canceled`,
    client_reference_id: user.id,
    metadata: { supabase_user_id: user.id },
    // Card at signup — required so the trial is card-backed and day-7
    // charges without a second checkout.
    payment_method_collection: "always",
  };

  // Stripe rejects customer + customer_email together. Prefer the existing
  // Customer id; otherwise let Checkout collect the email.
  if (customerId) {
    sessionParams.customer = customerId;
  } else if (user.email) {
    sessionParams.customer_email = user.email;
  }

  const session = await stripe.checkout.sessions.create(sessionParams);

  if (!session.url) {
    return NextResponse.json({ error: "Stripe did not return a checkout URL." }, { status: 500 });
  }

  return NextResponse.json({ url: session.url });
}

async function findOrCreateStripeCustomer(
  stripe: ReturnType<typeof getStripe>,
  userId: string,
  email: string | null,
): Promise<string | null> {
  if (email) {
    const listed = await stripe.customers.list({ email, limit: 10 });
    const match =
      listed.data.find((c) => c.metadata?.supabase_user_id === userId) ?? listed.data[0];
    if (match) {
      if (match.metadata?.supabase_user_id !== userId) {
        await stripe.customers.update(match.id, {
          metadata: { ...match.metadata, supabase_user_id: userId },
        });
      }
      return match.id;
    }
  }

  if (!email) return null;

  const created = await stripe.customers.create({
    email,
    metadata: { supabase_user_id: userId },
  });
  return created.id;
}
