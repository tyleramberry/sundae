import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSubscriptionEntitled, type SubscriptionRow } from "@/lib/trial";

export async function GET() {
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
  return NextResponse.json({
    entitled: isSubscriptionEntitled(row),
    status: row?.status ?? null,
  });
}
