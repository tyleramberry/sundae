import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  hasOpenStripeSubscription,
  isRecentIncompleteCheckout,
  pickStripeCustomerForUser,
  shouldBlockNewCheckout,
} from "./checkout";
import { resolveWebhookSubscriptionOwner } from "./webhook";

describe("pickStripeCustomerForUser", () => {
  it("reuses only a customer whose metadata matches this user", () => {
    const customers = [
      { id: "cus_other", metadata: { supabase_user_id: "user-b" } },
      { id: "cus_mine", metadata: { supabase_user_id: "user-a" } },
      { id: "cus_bare", metadata: {} },
    ];
    assert.equal(pickStripeCustomerForUser(customers, "user-a"), "cus_mine");
  });

  it("does not fall back to list[0] when no metadata matches", () => {
    const customers = [
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
  it("blocks trialing/active and a recent incomplete row", () => {
    assert.equal(shouldBlockNewCheckout({ status: "trialing" }), true);
    assert.equal(shouldBlockNewCheckout({ status: "active" }), true);
    const now = new Date("2026-08-25T12:00:00.000Z");
    assert.equal(
      shouldBlockNewCheckout(
        { status: "incomplete", updated_at: "2026-08-25T11:00:00.000Z" },
        now,
      ),
      true,
    );
  });

  it("allows a stale incomplete row and canceled/past_due locally", () => {
    const now = new Date("2026-08-25T12:00:00.000Z");
    assert.equal(
      shouldBlockNewCheckout(
        { status: "incomplete", updated_at: "2026-08-23T11:00:00.000Z" },
        now,
      ),
      false,
    );
    assert.equal(shouldBlockNewCheckout({ status: "canceled" }, now), false);
    assert.equal(isRecentIncompleteCheckout("incomplete", "2026-08-23T11:00:00.000Z", now), false);
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
