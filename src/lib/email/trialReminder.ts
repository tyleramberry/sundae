import { getAppUrl } from "@/lib/appUrl";
import { EmailError } from "@/lib/email/dailyFollowUp";

const RESEND_API = "https://api.resend.com/emails";

export type TrialReminderEmail = {
  subject: string;
  html: string;
  text: string;
};

function resolveAppUrl(appUrl?: string): string {
  return appUrl ?? getAppUrl();
}

export function buildTrialReminderEmail(appUrl?: string): TrialReminderEmail {
  const base = resolveAppUrl(appUrl).replace(/\/$/, "");
  const dashboardUrl = `${base}/dashboard`;
  const subject = "Your Sundae trial ends tomorrow";

  const text = [
    "Your Sundae trial ends tomorrow.",
    "",
    "Tomorrow your 7-day free trial ends and your card will be charged unless you cancel first.",
    "",
    "Cancel anytime from Settings — open the app and use Manage subscription in the sidebar. No hoops.",
    "",
    `Open Sundae → ${dashboardUrl}`,
  ].join("\n");

  const html = `<div style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px; background: #FAF7F2; color: #1C1917; line-height: 1.65;">
  <p style="font-size: 13px; letter-spacing: 0.08em; text-transform: uppercase; color: #78716C; margin: 0 0 20px;">Sundae</p>

  <p style="font-size: 18px; color: #1C1917; line-height: 1.4; letter-spacing: 0.01em; margin: 0 0 12px; font-weight: 600;">
    Your trial ends tomorrow
  </p>
  <p style="font-size: 15px; color: #57534E; line-height: 1.65; margin: 0 0 16px;">
    Tomorrow your 7-day free trial ends and your card will be charged unless you cancel first.
  </p>
  <p style="font-size: 15px; color: #57534E; line-height: 1.65; margin: 0 0 24px;">
    Cancel anytime from Settings — open the app and use <strong>Manage subscription</strong> in the sidebar. No hoops.
  </p>

  <a href="${dashboardUrl}" style="display: inline-block; margin-top: 8px; background: #7A9E7E; color: #ffffff; text-decoration: none; padding: 10px 22px; border-radius: 999px; font-size: 14px; font-weight: 500;">
    Open Sundae &rarr;
  </a>
  <p style="margin: 20px 0 0; font-size: 13px; line-height: 1.65;">
    <a href="${dashboardUrl}" style="color: #7A9E7E; text-decoration: none; font-weight: 500;">Manage subscription</a>
  </p>
  <p style="margin: 28px 0 0; padding-top: 16px; border-top: 1px solid #DDD6CC; font-size: 12px; color: #78716C; line-height: 1.65;">
    This is a billing reminder, not a scorecard. You can keep using Sundae through the last day of your trial.
  </p>
</div>`;

  return { subject, html, text };
}

export async function sendTrialReminderEmail(input: {
  to: string;
  appUrl?: string;
}): Promise<{ id: string }> {
  const { subject, html, text } = buildTrialReminderEmail(input.appUrl);

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
    throw new EmailError(`Failed to send trial reminder email: ${body}`);
  }

  return response.json();
}
