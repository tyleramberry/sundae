import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { EmailError, resolveFromAddress, sendResendEmail, type EmailsSend } from "./send";

describe("resolveFromAddress", () => {
  it("requires RESEND_FROM_EMAIL", () => {
    assert.throws(() => resolveFromAddress(undefined, "development"), EmailError);
  });

  it("rejects the Resend test from-address in production", () => {
    assert.throws(
      () => resolveFromAddress("Sundae <onboarding@resend.dev>", "production"),
      /onboarding@resend\.dev/,
    );
  });

  it("allows a verified-domain from address", () => {
    assert.equal(
      resolveFromAddress("Sundae <hello@sundaeplanner.com>", "production"),
      "Sundae <hello@sundaeplanner.com>",
    );
  });

  it("allows the test from-address outside production", () => {
    assert.equal(
      resolveFromAddress("Sundae <onboarding@resend.dev>", "development"),
      "Sundae <onboarding@resend.dev>",
    );
  });
});

describe("sendResendEmail", () => {
  it("awaits emails.send and returns the Resend id", async () => {
    const previousFrom = process.env.RESEND_FROM_EMAIL;
    process.env.RESEND_FROM_EMAIL = "Sundae <hello@sundaeplanner.com>";

    let captured:
      | {
          payload: Parameters<EmailsSend>[0];
          options: Parameters<EmailsSend>[1];
        }
      | undefined;

    const emailsSend: EmailsSend = async (payload, options) => {
      captured = { payload, options };
      return { data: { id: "49a3999c-test" }, error: null };
    };

    try {
      const result = await sendResendEmail(
        {
          to: "delivered@resend.dev",
          subject: "Hello",
          html: "<p>Hi</p>",
          text: "Hi",
          idempotencyKey: "daily-follow-up/user-1/2026-08-26",
          tags: [{ name: "category", value: "daily-follow-up" }],
          label: "daily follow-up email",
        },
        emailsSend,
      );

      assert.equal(result.id, "49a3999c-test");
      assert.equal(captured?.payload.from, "Sundae <hello@sundaeplanner.com>");
      assert.equal(captured?.payload.to, "delivered@resend.dev");
      assert.equal(captured?.options?.idempotencyKey, "daily-follow-up/user-1/2026-08-26");
      assert.equal(captured?.payload.tags?.[0]?.name, "category");
    } finally {
      if (previousFrom === undefined) delete process.env.RESEND_FROM_EMAIL;
      else process.env.RESEND_FROM_EMAIL = previousFrom;
    }
  });

  it("surfaces the SDK error object instead of throwing from emails.send", async () => {
    const previousFrom = process.env.RESEND_FROM_EMAIL;
    process.env.RESEND_FROM_EMAIL = "Sundae <hello@sundaeplanner.com>";

    const emailsSend: EmailsSend = async () => ({
      data: null,
      error: { message: "rate_limit_exceeded", name: "rate_limit_exceeded" },
    });

    try {
      await assert.rejects(
        sendResendEmail(
          {
            to: "delivered@resend.dev",
            subject: "Hello",
            html: "<p>Hi</p>",
            idempotencyKey: "welcome-user/1",
            label: "trial reminder email",
          },
          emailsSend,
        ),
        /Failed to send trial reminder email: rate_limit_exceeded/,
      );
    } finally {
      if (previousFrom === undefined) delete process.env.RESEND_FROM_EMAIL;
      else process.env.RESEND_FROM_EMAIL = previousFrom;
    }
  });
});
