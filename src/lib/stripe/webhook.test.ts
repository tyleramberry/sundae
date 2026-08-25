import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  constructVerifiedStripeEvent,
  currentPeriodEndIso,
  isHandledStripeEvent,
  mapStripeSubscriptionToRow,
  resolveWebhookSubscriptionOwner,
  StripeWebhookSignatureError,
} from "./webhook";

describe("mapStripeSubscriptionToRow", () => {
  it("prefers basil-era period end on the first subscription item", () => {
    const mapped = mapStripeSubscriptionToRow(
      {
        id: "sub_item",
        status: "trialing",
        customer: "cus_123",
        trial_end: 1_700_000_000,
        cancel_at_period_end: false,
        current_period_end: 1_600_000_000,
        items: { data: [{ current_period_end: 1_800_000_000 }] },
      },
      "user-1",
    );
    assert.ok(mapped);
    assert.equal(mapped.current_period_end, new Date(1_800_000_000 * 1000).toISOString());
    assert.equal(mapped.trial_end, new Date(1_700_000_000 * 1000).toISOString());
    assert.equal(mapped.user_id, "user-1");
    assert.equal(mapped.stripe_customer_id, "cus_123");
  });

  it("falls back to classic subscription.current_period_end", () => {
    const mapped = mapStripeSubscriptionToRow(
      {
        id: "sub_classic",
        status: "active",
        customer: { id: "cus_abc" },
        current_period_end: 1_600_000_000,
        cancel_at_period_end: true,
      },
      "user-2",
    );
    assert.ok(mapped);
    assert.equal(mapped.current_period_end, new Date(1_600_000_000 * 1000).toISOString());
    assert.equal(mapped.cancel_at_period_end, true);
    assert.equal(mapped.status, "active");
    assert.equal(mapped.stripe_customer_id, "cus_abc");
  });

  it("returns null when the customer id is missing", () => {
    assert.equal(
      mapStripeSubscriptionToRow({ id: "sub_x", status: "active" }, "user-3"),
      null,
    );
  });
});

describe("currentPeriodEndIso", () => {
  it("reads item period end before the top-level field", () => {
    assert.equal(
      currentPeriodEndIso({
        id: "s",
        status: "active",
        current_period_end: 10,
        items: { data: [{ current_period_end: 20 }] },
      }),
      new Date(20_000).toISOString(),
    );
  });
});

describe("isHandledStripeEvent", () => {
  it("ignores unmapped event types", () => {
    assert.equal(isHandledStripeEvent("invoice.paid"), false);
    assert.equal(isHandledStripeEvent("customer.created"), false);
    assert.equal(isHandledStripeEvent("checkout.session.completed"), true);
    assert.equal(isHandledStripeEvent("customer.subscription.updated"), true);
    assert.equal(isHandledStripeEvent("customer.subscription.deleted"), true);
  });
});

describe("constructVerifiedStripeEvent", () => {
  it("fails closed when the webhook secret is missing", () => {
    assert.throws(
      () =>
        constructVerifiedStripeEvent(
          { webhooks: { constructEvent: () => ({}) } },
          "{}",
          "sig",
          undefined,
        ),
      /STRIPE_WEBHOOK_SECRET is not set/,
    );
  });

  it("treats a missing or invalid signature as a signature error", () => {
    assert.throws(
      () =>
        constructVerifiedStripeEvent(
          { webhooks: { constructEvent: () => ({}) } },
          "{}",
          null,
          "whsec_test",
        ),
      (err: unknown) => err instanceof StripeWebhookSignatureError,
    );

    assert.throws(
      () =>
        constructVerifiedStripeEvent(
          {
            webhooks: {
              constructEvent: () => {
                throw new Error("No signatures found matching the expected signature for payload");
              },
            },
          },
          "{}",
          "t=1,v1=bad",
          "whsec_test",
        ),
      (err: unknown) => err instanceof StripeWebhookSignatureError,
    );
  });
});

describe("resolveWebhookSubscriptionOwner", () => {
  it("does not treat another user's subscription id as ours", () => {
    assert.equal(
      resolveWebhookSubscriptionOwner("incoming", { user_id: "owner" }),
      "other_user",
    );
    assert.equal(
      resolveWebhookSubscriptionOwner("owner", { user_id: "owner" }),
      "same_user",
    );
  });
});
