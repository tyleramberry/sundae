import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type Stripe from "stripe";
import type { createAdminClient } from "@/lib/supabase/admin";
import { handleSubscriptionUpdated } from "./route";

type AdminClient = ReturnType<typeof createAdminClient>;

// Fakes: stripe only needs subscriptions.retrieve; the admin only needs
// the subscriptions upsert path (resolveUserId short-circuits on the
// subscription's supabase_user_id metadata, so no other admin call runs).
function setup(liveOverrides: Record<string, unknown> = {}) {
  const retrieveCalls: string[] = [];
  const upserts: Array<Record<string, unknown>> = [];
  const live = {
    id: "sub_1",
    status: "canceled",
    customer: "cus_123",
    cancel_at_period_end: false,
    current_period_end: 1_700_000_000,
    metadata: { supabase_user_id: "user-1" },
    ...liveOverrides,
  };
  const stripe = {
    subscriptions: {
      retrieve: async (id: string) => {
        retrieveCalls.push(id);
        return live;
      },
    },
  } as unknown as Stripe;
  const admin = {
    from() {
      const chain = {
        upsert: async (row: Record<string, unknown>) => {
          upserts.push(row);
          return { error: null };
        },
      };
      return chain;
    },
  } as unknown as AdminClient;
  return { stripe, admin, live, retrieveCalls, upserts };
}

// The event snapshot: stale -- says the subscription is still active even
// though it has since been canceled (the live retrieve tells the truth).
function staleEventSubscription() {
  return {
    id: "sub_1",
    status: "active",
    customer: "cus_123",
    cancel_at_period_end: false,
    current_period_end: 1_700_000_000,
    metadata: { supabase_user_id: "user-1" },
  } as unknown as Stripe.Subscription;
}

describe("handleSubscriptionUpdated", () => {
  it("persists the live subscription state, not the event snapshot", async () => {
    const s = setup(); // live status is canceled
    await handleSubscriptionUpdated(s.stripe, s.admin, staleEventSubscription(), undefined);
    assert.deepEqual(s.retrieveCalls, ["sub_1"]);
    assert.equal(s.upserts.length, 1);
    assert.equal(s.upserts[0].status, "canceled");
  });

  it("still fires the incomplete→active conversion when the live state is active", async () => {
    const s = setup({ status: "active" });
    let analytics = 0;
    const admin = new Proxy(s.admin as unknown as Record<string, unknown>, {
      get(target, prop) {
        if (prop === "auth") {
          return {
            admin: {
              getUserById: async () => {
                analytics++;
                return { data: { user: { email: "a@b.c" } } };
            },
            },
          };
        }
        return target[prop as string];
      },
    }) as unknown as AdminClient;
    await handleSubscriptionUpdated(s.stripe, admin, staleEventSubscription(), {
      status: "incomplete",
    } as never);
    assert.equal(s.upserts[0].status, "active");
    assert.equal(analytics, 1);
  });

  it("does not fire conversion analytics when the live state is not active", async () => {
    const s = setup(); // live canceled despite the stale active snapshot
    let analytics = 0;
    const admin = new Proxy(s.admin as unknown as Record<string, unknown>, {
      get(target, prop) {
        if (prop === "auth") {
          return {
            admin: {
              getUserById: async () => {
                analytics++;
                return { data: { user: { email: "a@b.c" } } };
              },
            },
          };
        }
        return target[prop as string];
      },
    }) as unknown as AdminClient;
    await handleSubscriptionUpdated(s.stripe, admin, staleEventSubscription(), {
      status: "incomplete",
    } as never);
    assert.equal(s.upserts[0].status, "canceled");
    assert.equal(analytics, 0);
  });
});
