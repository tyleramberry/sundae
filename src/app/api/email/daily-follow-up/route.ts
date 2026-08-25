import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { EmailError, sendDailyFollowUpEmail } from "@/lib/email/dailyFollowUp";

// Manual trigger for now -- sends the signed-in user their own daily
// follow-up nudge. Day 11 points a Vercel Cron job at the same
// sendDailyFollowUpEmail function (looping every user instead of the
// single signed-in one), fixed morning send time. This route exists today
// so the email is actually sendable/testable ahead of that wiring.
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !user.email) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  try {
    const { data: sub } = await supabase
      .from("subscriptions")
      .select("status, trial_end, current_period_end, created_at")
      .eq("user_id", user.id)
      .maybeSingle();

    const result = await sendDailyFollowUpEmail({
      to: user.email,
      userId: user.id,
      supabase,
      createdAt: user.created_at,
      subscription: sub,
    });
    return NextResponse.json({ ok: true, id: result.id });
  } catch (error) {
    if (error instanceof EmailError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}
