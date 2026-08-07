// Daily follow-up nudge email (Day 10 v1) -- the reminder to open the app
// and log progress against this week's plan. Per the MVP spec, logging is
// in-app only: this is a single CTA, not a reply-based done/not-done
// channel, and deliberately simpler than the daily brief (Day 12, which
// adds yesterday's recap + today's big three on top of this).
//
// Raw fetch against Resend's REST API, same style as calendar.ts's Google
// Calendar calls -- no SDK dependency for a one-endpoint integration.
// Wiring this to send automatically every morning is Day 11's job (Vercel
// Cron); this module is just render + send, and /api/email/daily-follow-up
// is a manual trigger for now.

const RESEND_API = "https://api.resend.com/emails";

export class EmailError extends Error {}

export type DailyFollowUpEmail = {
  subject: string;
  html: string;
  text: string;
};

function resolveAppUrl(appUrl?: string): string {
  return appUrl ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}

export function buildDailyFollowUpEmail(appUrl?: string): DailyFollowUpEmail {
  const url = resolveAppUrl(appUrl);

  return {
    subject: "Log today's progress",
    text: `Quick one — open Sundae and check off what you got done today, so this week's plan stays accurate.\n\n${url}`,
    html: `<div style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px;">
  <p style="font-size: 13px; letter-spacing: 0.08em; text-transform: uppercase; color: #71717a; margin: 0 0 12px;">Sundae</p>
  <p style="font-size: 16px; color: #18181b; line-height: 1.5; margin: 0 0 24px;">
    Quick one — take a minute to check off what you got done today, so this week's plan stays accurate.
  </p>
  <a href="${url}" style="display: inline-block; background: #000000; color: #ffffff; text-decoration: none; padding: 10px 22px; border-radius: 999px; font-size: 14px; font-weight: 500;">
    Log your progress &rarr;
  </a>
</div>`,
  };
}

export type SendDailyFollowUpInput = {
  to: string;
  appUrl?: string;
};

export async function sendDailyFollowUpEmail(
  input: SendDailyFollowUpInput,
): Promise<{ id: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new EmailError(
      "RESEND_API_KEY is not set. Add a Resend API key to .env.local (and RESEND_FROM_EMAIL, once a sending domain is verified) to send real email.",
    );
  }

  const from = process.env.RESEND_FROM_EMAIL ?? "Sundae <onboarding@resend.dev>";
  const { subject, html, text } = buildDailyFollowUpEmail(input.appUrl);

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
