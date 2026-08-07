import { buildDailyFollowUpEmail } from "@/lib/email/dailyFollowUp";

// Read-only render preview (no auth, no send) -- lets /debug/email show the
// actual HTML in an iframe without needing a Resend API key on file.
export async function GET() {
  const { html } = buildDailyFollowUpEmail();
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}
