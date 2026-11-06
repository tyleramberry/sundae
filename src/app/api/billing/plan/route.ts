import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { loadFreeTierAccess, planSummaryOf } from "@/lib/weeklySession/freeTier";

// Freemium plan line for client pages (the dashboard header). Same source
// as the (app) layout's sidebar line: user-scoped client, RLS select-own.
// `plan: null` when billing isn't enforced (local dev without Stripe).
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  try {
    const plan = planSummaryOf(await loadFreeTierAccess(supabase, user.id));
    return NextResponse.json({ plan });
  } catch (error) {
    console.error("[billing/plan] failed to load plan:", error);
    return NextResponse.json({ error: "Couldn't load your plan." }, { status: 500 });
  }
}
