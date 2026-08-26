import { Resend } from "resend";

export class EmailError extends Error {}

const RESEND_TEST_FROM = "onboarding@resend.dev";

export type SendEmailInput = {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  idempotencyKey: string;
  tags?: { name: string; value: string }[];
  /** Prefix for EmailError messages, e.g. "daily follow-up email". */
  label?: string;
};

export type EmailsSend = (
  payload: {
    from: string;
    to: string | string[];
    subject: string;
    html: string;
    text?: string;
    tags?: { name: string; value: string }[];
  },
  options?: { idempotencyKey?: string },
) => Promise<{
  data: { id: string } | null;
  error: { message: string; name?: string } | null;
}>;

export function resolveFromAddress(
  from = process.env.RESEND_FROM_EMAIL,
  nodeEnv = process.env.NODE_ENV,
): string {
  if (!from) {
    throw new EmailError(
      "RESEND_FROM_EMAIL is not set. Verify a sending domain at https://resend.com/domains and set RESEND_FROM_EMAIL (for example, Sundae <hello@yourdomain.com>).",
    );
  }
  if (nodeEnv === "production" && from.toLowerCase().includes(RESEND_TEST_FROM)) {
    throw new EmailError(
      "RESEND_FROM_EMAIL uses onboarding@resend.dev, which is a Resend test address and is not allowed in production. Use a verified domain.",
    );
  }
  return from;
}

function resolveApiKey(apiKey = process.env.RESEND_API_KEY): string {
  if (!apiKey) {
    throw new EmailError(
      "RESEND_API_KEY is not set. Add a Resend API key to .env.local (and RESEND_FROM_EMAIL, once a sending domain is verified) to send real email.",
    );
  }
  return apiKey;
}

export async function sendResendEmail(
  input: SendEmailInput,
  emailsSend?: EmailsSend,
): Promise<{ id: string }> {
  const from = resolveFromAddress();
  const send =
    emailsSend ??
    ((payload, options) => new Resend(resolveApiKey()).emails.send(payload, options));

  const { data, error } = await send(
    {
      from,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
      tags: input.tags,
    },
    { idempotencyKey: input.idempotencyKey },
  );

  const label = input.label ?? "email";
  if (error) {
    throw new EmailError(`Failed to send ${label}: ${error.message}`);
  }
  if (!data?.id) {
    throw new EmailError(`Failed to send ${label}: missing id in Resend response`);
  }
  return { id: data.id };
}
