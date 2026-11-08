import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildSubscriptionCheckoutParams,
  canPersistPendingCheckoutRow,
  checkoutSessionBelongsToUser,
  checkoutSessionLooksFulfilled,
  hasOpenStripeSubscription,
  isRecentIncompleteCheckout,
  pickStripeCustomerForUser,
  shouldBlockNewCheckout,
  stripeCustomerBelongsToUser,
  type StripeCustomerLike,
} from "./checkout";
import { resolveWebhookSubscriptionOwner } from "./webhook";

describe("pickStripeCustomerForUser", () => {
  it("reuses only a customer whose metadata matches this user", () => {
    const customers: StripeCustomerLike[] = [
      { id: "cus_other", metadata: { supabase_user_id: "user-b" } },
      { id: "cus_mine", metadata: { supabase_user_id: "user-a" } },
      { id: "cus_bare", metadata: {} },
    ];
    assert.equal(pickStripeCustomerForUser(customers, "user-a"), "cus_mine");
  });

  it("does not fall back to list[0] when no metadata matches", () => {
    const customers: StripeCustomerLike[] = [
      { id: "cus_other", metadata: { supabase_user_id: "someone-else" } },
      { id: "cus_unlabeled", metadata: null },
    ];
    assert.equal(pickStripeCustomerForUser(customers, "user-a"), null);
  });
});

describe("hasOpenStripeSubscription", () => {
  it("treats canceled and incomplete_expired as closed", () => {
    assert.equal(hasOpenStripeSubscription([]), false);
    assert.equal(hasOpenStripeSubscription(["canceled"]), false);
    assert.equal(hasOpenStripeSubscription(["incomplete_expired", "canceled"]), false);
  });

  it("blocks checkout when any live Stripe status is present", () => {
    for (const status of ["trialing", "active", "past_due", "unpaid", "incomplete", "paused"]) {
      assert.equal(hasOpenStripeSubscription([status]), true, status);
    }
    assert.equal(hasOpenStripeSubscription(["canceled", "past_due"]), true);
  });
});

describe("shouldBlockNewCheckout", () => {
  it("blocks trialing/active", () => {
    assert.equal(shouldBlockNewCheckout({ status: "trialing" }), true);
    assert.equal(shouldBlockNewCheckout({ status: "active" }), true);
  });

  it("blocks incomplete only for a ~2 minute in-flight lock, not 24h", () => {
    const now = new Date("2026-08-25T12:00:00.000Z");
    assert.equal(
      isRecentIncompleteCheckout("incomplete", "2026-08-25T11:59:00.000Z", now),
      true,
    );
    assert.equal(
      shouldBlockNewCheckout(
        { status: "incomplete", updated_at: "2026-08-25T11:59:00.000Z" },
        now,
      ),
      true,
    );
    assert.equal(
      isRecentIncompleteCheckout("incomplete", "2026-08-25T11:57:59.000Z", now),
      false,
    );
    assert.equal(
      shouldBlockNewCheckout(
        { status: "incomplete", updated_at: "2026-08-24T12:00:00.000Z" },
        now,
      ),
      false,
    );
    assert.equal(shouldBlockNewCheckout({ status: "incomplete_expired" }, now), false);
    assert.equal(shouldBlockNewCheckout({ status: "canceled" }, now), false);
  });
});

describe("canPersistPendingCheckoutRow", () => {
  it("allows first-time, pending, canceled, and past_due — not live statuses", () => {
    assert.equal(canPersistPendingCheckoutRow(null), true);
    assert.equal(canPersistPendingCheckoutRow("incomplete"), true);
    assert.equal(canPersistPendingCheckoutRow("incomplete_expired"), true);
    assert.equal(canPersistPendingCheckoutRow("canceled"), true);
    assert.equal(canPersistPendingCheckoutRow("past_due"), true);
    assert.equal(canPersistPendingCheckoutRow("trialing"), false);
    assert.equal(canPersistPendingCheckoutRow("active"), false);
  });
});

describe("checkoutSessionBelongsToUser", () => {
  it("accepts metadata, client_reference_id, or matching customer id", () => {
    assert.equal(
      checkoutSessionBelongsToUser({ metadata: { supabase_user_id: "u1" } }, "u1", null),
      true,
    );
    assert.equal(
      checkoutSessionBelongsToUser({ client_reference_id: "u1" }, "u1", "cus_x"),
      true,
    );
    assert.equal(
      checkoutSessionBelongsToUser({ customer: "cus_x" }, "u1", "cus_x"),
      true,
    );
    assert.equal(
      checkoutSessionBelongsToUser({ customer: "cus_other", metadata: {} }, "u1", "cus_x"),
      false,
    );
  });
});

describe("checkoutSessionLooksFulfilled", () => {
  it("requires a subscription id plus paid or complete", () => {
    assert.equal(
      checkoutSessionLooksFulfilled({ status: "complete", payment_status: "paid", subscription: "sub_1" }),
      true,
    );
    assert.equal(
      checkoutSessionLooksFulfilled({ status: "open", payment_status: "unpaid", subscription: "sub_1" }),
      false,
    );
    assert.equal(
      checkoutSessionLooksFulfilled({ status: "complete", payment_status: "paid", subscription: null }),
      false,
    );
  });
});

describe("resolveWebhookSubscriptionOwner", () => {
  it("aborts when the subscription id already belongs to another user", () => {
    assert.equal(
      resolveWebhookSubscriptionOwner("user-a", { user_id: "user-b" }),
      "other_user",
    );
    assert.equal(
      resolveWebhookSubscriptionOwner("user-a", { user_id: "user-a" }),
      "same_user",
    );
    assert.equal(resolveWebhookSubscriptionOwner("user-a", null), "missing");
  });
});

describe("buildSubscriptionCheckoutParams (freemium)", () => {
  const params = buildSubscriptionCheckoutParams({
    customerId: "cus_123",
    priceId: "price_123",
    userId: "user-1",
    appUrl: "https://app.example.com/",
  });

  it("no longer creates a Stripe trial", () => {
    assert.equal("trial_period_days" in params.subscription_data, false);
    assert.equal(JSON.stringify(params).includes("trial"), false);
  });

  it("charges the existing price with a card, tagged to the Sundae user", () => {
    assert.equal(params.mode, "subscription");
    assert.equal(params.customer, "cus_123");
    assert.deepEqual(params.line_items, [{ price: "price_123", quantity: 1 }]);
    assert.equal(params.payment_method_collection, "always");
    assert.equal(params.client_reference_id, "user-1");
    assert.deepEqual(params.metadata, { supabase_user_id: "user-1" });
    assert.deepEqual(params.subscription_data.metadata, { supabase_user_id: "user-1" });
  });

  it("returns to /subscribe for the confirm poll, trimming a trailing slash", () => {
    assert.equal(
      params.success_url,
      "https://app.example.com/subscribe?checkout=success&session_id={CHECKOUT_SESSION_ID}",
    );
    assert.equal(params.cancel_url, "https://app.example.com/subscribe?checkout=canceled");
  });
});

describe("stripeCustomerBelongsToUser", () => {
  it("accepts a customer tagged with this user", () => {
    assert.equal(
      stripeCustomerBelongsToUser({ metadata: { supabase_user_id: "u1" } }, "u1"),
      true,
    );
  });
  it("rejects another user's customer", () => {
    assert.equal(
      stripeCustomerBelongsToUser({ metadata: { supabase_user_id: "u2" } }, "u1"),
      false,
    );
  });
  it("rejects null / empty metadata", () => {
    assert.equal(stripeCustomerBelongsToUser({ metadata: null }, "u1"), false);
    assert.equal(stripeCustomerBelongsToUser({ metadata: {} }, "u1"), false);
  });
  it("rejects a deleted customer even with matching metadata", () => {
    assert.equal(
      stripeCustomerBelongsToUser(
        { deleted: true, metadata: { supabase_user_id: "u1" } },
        "u1",
      ),
      false,
    );
  });
  it("rejects null", () => {
    assert.equal(stripeCustomerBelongsToUser(null, "u1"), false);
  });
});
