import { buildDailyFollowUpEmail } from "@/lib/email/dailyFollowUp";
import type { TodayBrief } from "@/lib/dailyBrief/gather";
import type { NudgeCopy } from "@/lib/agents/dailyNudgeAgent";

// Read-only render preview (no auth, no send, no real data) -- lets
// /debug/email show the actual HTML in an iframe without needing a signed-in
// user or a Resend API key on file. A real send (see the sibling POST
// route) pulls the real brief via getTodayBrief + the real agent via
// getNudgeCopy; this route can't, since there's no user to gather data
// for, so it renders the exact same template against clearly-labeled
// example data instead.
const EXAMPLE_BRIEF: TodayBrief = {
  dateISO: new Date().toISOString().slice(0, 10),
  weekdayLabel: new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }),
  todayItems: [
    { id: "example-1", role: "Athlete", title: "Run every day", type: "habit" },
    { id: "example-2", role: "Founder", title: "Send the investor update", type: "goal" },
  ],
  ongoingProjects: [
    { id: "example-3", role: "Founder", title: "Close the seed round", percent: 40 },
  ],
};

const EXAMPLE_COPY: NudgeCopy = {
  greeting: "Example preview — not your real data.",
  focusLine: "This is what today's brief looks like once items are scheduled.",
};

export async function GET() {
  const { html } = buildDailyFollowUpEmail(EXAMPLE_BRIEF, EXAMPLE_COPY);
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}
