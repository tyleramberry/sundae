import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTodayBrief } from "@/lib/dailyBrief/gather";
import { getNudgeCopy } from "@/lib/agents/dailyNudgeAgent";
import { buildDailyFollowUpEmail } from "@/lib/email/dailyFollowUp";

// Read-only debug output: runs the REAL gather (src/lib/dailyBrief/gather.ts
// -- real Google Calendar lookups for what's scheduled today, real ongoing
// projects) and the REAL agent (src/lib/agents/dailyNudgeAgent.ts -- an
// actual Claude call) against the signed-in user's own data, then returns
// what the email would contain. No Resend call, no send -- this exists so
// the brief + the agent's copy can be inspected without RESEND_API_KEY
// being set, and without spending a real send just to check the output.
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  try {
    const brief = await getTodayBrief(supabase, user.id);
    const copy = await getNudgeCopy(brief);
    const { subject, html, text } = buildDailyFollowUpEmail(brief, copy);
    return NextResponse.json({ brief, copy, subject, html, text });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
