// Daily follow-up nudge email. Day 10 shipped a single generic CTA; this
// version (built alongside the Day 15 trend view) makes it an actual daily
// brief -- today's date, what's on the calendar today, and any ongoing
// project that still needs a push -- per the MVP spec's "today's big
// three + carryover" daily-brief goal.
//
// The item/project lists here are always real data from
// src/lib/dailyBrief/gather.ts, rendered deterministically. Only the short
// greeting + focus line at the top come from the separate agent in
// src/lib/agents/dailyNudgeAgent.ts -- see that file's header for why it's
// split out rather than folded in here.
//
// Raw fetch against Resend's REST API, same style as calendar.ts's Google
// Calendar calls -- no SDK dependency for a one-endpoint integration.

import type { SupabaseClient } from "@supabase/supabase-js";
import { getTodayBrief, type TodayBrief } from "@/lib/dailyBrief/gather";
import { getNudgeCopy, type NudgeCopy } from "@/lib/agents/dailyNudgeAgent";
import { formatTrialFooter, getTrialStatus } from "@/lib/trial";

const RESEND_API = "https://api.resend.com/emails";

export class EmailError extends Error {}

export type DailyFollowUpEmail = {
  subject: string;
  html: string;
  text: string;
};

function resolveAppUrl(appUrl?: string): string {
  return appUrl ?? process.env.NEXT_PUBLIC_APP_URL ?? (process.env.NODE_ENV === "production" ? "https://sundaeplanner.com" : "http://localhost:3000");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildDailyFollowUpEmail(
  brief: TodayBrief,
  copy: NudgeCopy,
  appUrl?: string,
  createdAt?: string | null,
): DailyFollowUpEmail {
  const base = resolveAppUrl(appUrl);
  // Deep-link straight to the in-app logging surface, not the app root, so
  // the nudge lands the user exactly where they check things off.
  const url = `${base.replace(/\/$/, "")}/daily-follow-ups`;

  const subject = `${brief.weekdayLabel.split(",")[0]} — your Sundae brief`;

  // Trust-signal footer (spec #5): only rendered when we actually know the
  // user's account age -- callers that don't pass createdAt (e.g. the debug
  // preview) skip it rather than showing a fabricated day count.
  const trial = createdAt ? getTrialStatus(createdAt) : null;
  const trialLine = trial?.isActive ? formatTrialFooter(trial) : null;

  const itemLines = brief.todayItems.map((i) => `- [${i.role}] ${i.title}`).join("\n");
  const projectLines = brief.ongoingProjects
    .map((p) => `- [${p.role}] ${p.title} — ${p.percent}%`)
    .join("\n");

  const text = [
    brief.weekdayLabel,
    "",
    copy.greeting,
    copy.focusLine,
    "",
    "Scheduled today:",
    brief.todayItems.length > 0 ? itemLines : "  Nothing on the calendar today.",
    "",
    "Ongoing project" + (brief.ongoingProjects.length === 1 ? "" : "s") + ":",
    brief.ongoingProjects.length > 0 ? projectLines : "  None in progress this week.",
    "",
    `Log your progress → ${url}`,
    ...(trialLine ? ["", trialLine] : []),
  ].join("\n");

  // Calm-identity retheme (spec #3). Email inline styles can't inherit
  // from globals.css, so the palette is hand-swapped here to the exact
  // tokens the app uses: canvas #FAF7F2 (backgrounds), ink #1C1917
  // (body), ink-secondary #78716C (meta/labels), border #DDD6CC
  // (dividers), accent #7A9E7E (CTA button). Line-heights bumped to
  // 1.65 (body) and 1.4 (single strong line) to match the app-side
  // typography rules.
  const itemsHtml =
    brief.todayItems.length > 0
      ? `<ul style="margin:0;padding:0;list-style:none;">
      ${brief.todayItems
        .map(
          (i) => `<li style="padding:9px 0;border-top:1px solid #DDD6CC;font-size:14.5px;color:#1C1917;line-height:1.65;">
        <span style="font-size:10.5px;letter-spacing:0.06em;text-transform:uppercase;color:#78716C;">${escapeHtml(i.role)}</span><br/>
        ${escapeHtml(i.title)}
      </li>`,
        )
        .join("")}
    </ul>`
      : `<p style="font-size:14px;color:#78716C;margin:0;line-height:1.65;">Nothing on the calendar today.</p>`;

  const projectsHtml =
    brief.ongoingProjects.length > 0
      ? `<ul style="margin:0;padding:0;list-style:none;">
      ${brief.ongoingProjects
        .map(
          (p) => `<li style="padding:9px 0;border-top:1px solid #DDD6CC;font-size:14.5px;color:#1C1917;line-height:1.65;">
        <span style="font-size:10.5px;letter-spacing:0.06em;text-transform:uppercase;color:#78716C;">${escapeHtml(p.role)}</span><br/>
        ${escapeHtml(p.title)} — <strong>${p.percent}%</strong>
      </li>`,
        )
        .join("")}
    </ul>`
      : `<p style="font-size:14px;color:#78716C;margin:0;line-height:1.65;">None in progress this week.</p>`;

  const html = `<div style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px; background: #FAF7F2; color: #1C1917; line-height: 1.65;">
  <p style="font-size: 13px; letter-spacing: 0.08em; text-transform: uppercase; color: #78716C; margin: 0 0 4px;">Sundae</p>
  <p style="font-size: 13px; color: #C4BAB1; margin: 0 0 20px;">${escapeHtml(brief.weekdayLabel)}</p>

  <p style="font-size: 16px; color: #1C1917; line-height: 1.4; letter-spacing: 0.01em; margin: 0 0 4px; font-weight: 600;">
    ${escapeHtml(copy.greeting)}
  </p>
  <p style="font-size: 15px; color: #57534E; line-height: 1.65; margin: 0 0 24px;">
    ${escapeHtml(copy.focusLine)}
  </p>

  <p style="font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: #78716C; margin: 0 0 6px;">Scheduled today</p>
  ${itemsHtml}

  <p style="font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: #78716C; margin: 24px 0 6px;">Ongoing project${brief.ongoingProjects.length === 1 ? "" : "s"}</p>
  ${projectsHtml}

  <a href="${url}" style="display: inline-block; margin-top: 28px; background: #7A9E7E; color: #ffffff; text-decoration: none; padding: 10px 22px; border-radius: 999px; font-size: 14px; font-weight: 500;">
    Log your progress &rarr;
  </a>
${trialLine ? `\n  <p style="margin: 28px 0 0; padding-top: 16px; border-top: 1px solid #DDD6CC; font-size: 12px; color: #78716C; line-height: 1.65;">${escapeHtml(trialLine)}</p>` : ""}
</div>`;

  return { subject, html, text };
}

export type SendDailyFollowUpInput = {
  to: string;
  userId: string;
  supabase: SupabaseClient;
  appUrl?: string;
  referenceDate?: Date;
  createdAt?: string | null;
};

export async function sendDailyFollowUpEmail(
  input: SendDailyFollowUpInput,
): Promise<{ id: string }> {
  // Gather + generate first, check for a Resend key last -- this is the
  // part worth actually exercising (and worth failing loudly on, via
  // getTodayBrief/getNudgeCopy's own error paths) regardless of whether
  // sending is configured yet. A missing RESEND_API_KEY shouldn't hide a
  // real bug in the brief or the agent behind an earlier, unrelated error.
  const brief = await getTodayBrief(input.supabase, input.userId, input.referenceDate);
  const copy = await getNudgeCopy(brief);
  const { subject, html, text } = buildDailyFollowUpEmail(brief, copy, input.appUrl, input.createdAt);

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new EmailError(
      "RESEND_API_KEY is not set. Add a Resend API key to .env.local (and RESEND_FROM_EMAIL, once a sending domain is verified) to send real email.",
    );
  }

  const from = process.env.RESEND_FROM_EMAIL ?? "Sundae <onboarding@resend.dev>";

  const response = await fetch(RESEND_API, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to: input.to, subject, html, text }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new EmailError(`Failed to send daily follow-up email: ${body}`);
  }

  return response.json();
}
