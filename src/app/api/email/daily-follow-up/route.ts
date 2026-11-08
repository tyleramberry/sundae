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
// SEC-1 finding L2: any signed-in user could call this, with no throttle and
// no environment gate, and each call reaches a real Claude call (getNudgeCopy,
// inside sendDailyFollowUpEmail) plus a real Resend send. Its only caller
// anywhere in the repo is /debug/email, which is itself dev-only
// (src/app/debug/layout.tsx 404s in production), so the route now carries the
// same gate as its preview sibling, and reserves a row in the shared per-user
// LLM spend guard before the send.
type SupabaseServer = Awaited<ReturnType<typeof createClient>>;

export type ManualEmailResult = { status: number; body: Record<string, unknown> };

// Everything after the environment gate and the auth check, with the sender
// injected so a test can drive the real send path against a stub.
export async function runDailyFollowUpTrigger(input: {
  supabase: SupabaseServer;
  user: { id: string; email: string };
  send: typeof sendDailyFollowUpEmail;
}): Promise<ManualEmailResult> {
  try {
    const spendLimit = await enforceLlmSpend(
      input.supabase,
      input.user.id,
      "email/daily-follow-up",
    );
    if (spendLimit) return { status: 429, body: spendLimit };

    const result = await input.send({
      to: input.user.email,
      userId: input.user.id,
      supabase: input.supabase,
    });
    return { status: 200, body: { ok: true, id: result.id } };
  } catch (error) {
    if (error instanceof EmailError) {
      return { status: 400, body: { error: error.message } };
    }
    throw error;
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

  const result = await runDailyFollowUpTrigger({
    supabase,
    user: { id: user.id, email: user.email },
    send: sendDailyFollowUpEmail,
  });
  return NextResponse.json(result.body, { status: result.status });
}
