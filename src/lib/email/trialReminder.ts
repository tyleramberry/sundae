import { getAppUrl } from "@/lib/appUrl";
import { sendResendEmail } from "@/lib/email/send";

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
  userId: string;
  trialEnd?: string | null;
  appUrl?: string;
}): Promise<{ id: string }> {
  const { subject, html, text } = buildTrialReminderEmail(input.appUrl);
  const trialKey = (input.trialEnd ?? new Date().toISOString()).slice(0, 10);

  return sendResendEmail({
    to: input.to,
    subject,
    html,
    text,
    idempotencyKey: `trial-reminder/${input.userId}/${trialKey}`,
    tags: [
      { name: "category", value: "trial-reminder" },
      { name: "user_id", value: input.userId },
    ],
    label: "trial reminder email",
  });
}
