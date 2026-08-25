import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getStripe } from "@/lib/stripe/client";
import { getAppUrl } from "@/lib/appUrl";

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
      { error: "No billing customer on file. Start a trial first." },
      { status: 400 },
    );
  }

  const stripe = getStripe();
  const appUrl = getAppUrl().replace(/\/$/, "");
  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${appUrl}/dashboard`,
  });

  if (!session.url) {
    return NextResponse.json({ error: "Stripe did not return a portal URL." }, { status: 500 });
  }

  return NextResponse.json({ url: session.url });
}
