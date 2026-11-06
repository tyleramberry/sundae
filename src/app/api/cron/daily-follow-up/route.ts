import { NextResponse } from "next/server";
import { isAuthorizedCronRequest, unauthorizedCronResponse } from "@/lib/cron/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { EmailError, sendDailyFollowUpEmail } from "@/lib/email/dailyFollowUp";
import { sendTrialReminderEmail } from "@/lib/email/trialReminder";
import { trialReminderWindowBounds } from "@/lib/billing";

// Day 11 cron trigger for the Day 10 email (see vercel.json for the
// schedule). /api/email/daily-follow-up stays as-is -- a manual trigger for
// the signed-in user, useful for testing the render -- this is the real
// automatic send, looping every onboarded user instead of one.
//
// "Onboarded" = has a row in onboarding_answers: that's the same
// completed-onboarding signal the rest of the app uses (see
// getOnboardingAnswers), and it's a reasonable proxy for "has a plan worth
// logging progress against" -- someone who never finished onboarding has
// nothing in weekly_items yet anyway.
export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return unauthorizedCronResponse();
  }

  const supabase = createAdminClient();

  const { data: onboarded, error } = await supabase
    .from("onboarding_answers")
    .select("user_id");

  if (error) {
    console.error("Daily follow-up cron: failed to load onboarded users:", error);
    return NextResponse.json({ error: "Failed to load users" }, { status: 500 });
  }

  const userIds = (onboarded ?? []).map((row) => row.user_id as string);

  let sent = 0;
  const failures: { userId: string; message: string }[] = [];

  for (const userId of userIds) {
    try {
      const { data: userResult, error: userError } =
        await supabase.auth.admin.getUserById(userId);

      if (userError || !userResult.user?.email) {
        failures.push({
          userId,
          message: userError?.message ?? "No email on file for this user.",
        });
        continue;
      }

      await sendDailyFollowUpEmail({
        to: userResult.user.email,
        userId,
        supabase,
      });
      sent += 1;
    } catch (err) {
      // One bad address or a transient Resend error shouldn't stop the rest
      // of the run -- log it and keep sending to everyone else.
      const message =
        err instanceof EmailError || err instanceof Error ? err.message : String(err);
      console.error(`Daily follow-up cron: failed to email user ${userId}:`, message);
      failures.push({ userId, message });
    }
  }

  let trialRemindersSent = 0;
  const trialReminderFailures: { userId: string; message: string }[] = [];

  // Legacy (dormant) day-6 reminder for pre-freemium card-backed trials --
  // those users were promised a "you'll be charged tomorrow" email.
  // Checkout no longer creates trials, so this query empties on its own;
  // delete it with trialReminder.ts once the last existing trial_end passes.
  const window = trialReminderWindowBounds();
  const { data: trialing, error: trialError } = await supabase
    .from("subscriptions")
    .select("user_id, trial_end, status")
    .eq("status", "trialing")
    .gt("trial_end", window.after)
    .lte("trial_end", window.onOrBefore);

  if (trialError) {
    console.error("Daily follow-up cron: failed to load day-6 trials:", trialError);
  } else {
    for (const row of trialing ?? []) {
      const userId = row.user_id as string;
      try {
        const { data: userResult, error: userError } =
          await supabase.auth.admin.getUserById(userId);

        if (userError || !userResult.user?.email) {
          trialReminderFailures.push({
            userId,
            message: userError?.message ?? "No email on file for this user.",
          });
          continue;
        }

        await sendTrialReminderEmail({ to: userResult.user.email });
        trialRemindersSent += 1;
      } catch (err) {
        const message =
          err instanceof EmailError || err instanceof Error ? err.message : String(err);
        console.error(`Daily follow-up cron: trial reminder failed for ${userId}:`, message);
        trialReminderFailures.push({ userId, message });
      }
    }
  }

  return NextResponse.json({
    total: userIds.length,
    sent,
    failures,
    trialRemindersSent,
    trialReminderFailures,
  });
}
