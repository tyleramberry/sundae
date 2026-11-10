import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isProductionRuntime, productionUnavailableResponse } from "@/lib/devOnly";
import { enforceLlmSpend } from "@/lib/llm/spendGuard";
import { EmailError, sendDailyFollowUpEmail } from "@/lib/email/dailyFollowUp";

// Manual trigger for now -- sends the signed-in user their own daily
// follow-up nudge. Day 11 points a Vercel Cron job at the same
// sendDailyFollowUpEmail function (looping every user instead of the
// single signed-in one), fixed morning send time. This route exists today
// so the email is actually sendable/testable ahead of that wiring.
//
// S-5: that makes it a developer/tester endpoint, not a product surface,
// so POST 404s outside local dev (same gate as the email debug routes) --
// until now any signed-in user could hit it. Each call also spends real
// Claude tokens (getNudgeCopy inside sendDailyFollowUpEmail) and a real
// Resend send, so it reserves a row in the shared per-user spend guard
// (src/lib/llm/spendGuard.ts) before reaching either. No second counter:
// the spend guard is deliberately the repo-wide single counter.

type SupabaseServer = Awaited<ReturnType<typeof createClient>>;

export type DailyFollowUpResult = { status: number; body: Record<string, unknown> };

export async function runDailyFollowUpEmailTrigger(input: {
  supabase: SupabaseServer;
  user: { id: string; email: string };
  sendDailyFollowUpEmail: typeof sendDailyFollowUpEmail;
}): Promise<DailyFollowUpResult> {
  try {
    // Inside the try so a Supabase failure fails closed (the guard throws
    // when it can't read the count) and never reaches Claude or Resend.
    const spendLimit = await enforceLlmSpend(
      input.supabase,
      input.user.id,
      "email/daily-follow-up",
    );
    if (spendLimit) return { status: 429, body: spendLimit };

    const result = await input.sendDailyFollowUpEmail({
      to: input.user.email,
      userId: input.user.id,
      supabase: input.supabase,
    });
    return { status: 200, body: { ok: true, id: result.id } };
  } catch (error) {
    if (error instanceof EmailError) {
      return { status: 400, body: { error: error.message } };
    }
    console.error("[email/daily-follow-up] failed to prepare or send:", error);
    return {
      status: 502,
      body: { error: "Couldn't send the follow-up email. Try again." },
    };
  }
}

export async function POST() {
  if (isProductionRuntime()) return productionUnavailableResponse();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !user.email) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const email = user.email;
  const result = await runDailyFollowUpEmailTrigger({
    supabase,
    user: { id: user.id, email },
    sendDailyFollowUpEmail,
  });
  return NextResponse.json(result.body, { status: result.status });
}
