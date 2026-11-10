import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { openBillingPortal, type PortalStripeClient } from "./route";
import type { RetrievedStripeCustomer } from "@/lib/stripe/checkout";

function fakeStripe(retrieve: () => Promise<RetrievedStripeCustomer>) {
  const portalParams: Array<{ customer: string; return_url: string }> = [];
  const stripe: PortalStripeClient = {
    customers: { retrieve },
    billingPortal: {
      sessions: {
        async create(params) {
          portalParams.push(params);
          return { url: "https://billing.example/portal" };
        },
      },
    },
  };
  return { stripe, portalParams };
}

const base = { customerId: "cus_stored", userId: "user-a", appUrl: "https://app.example" };

describe("openBillingPortal", () => {
  it("refuses another user's customer and never creates a session", async () => {
    const { stripe, portalParams } = fakeStripe(async () => ({
      metadata: { supabase_user_id: "user-b" },
    }));
    const res = await openBillingPortal({ stripe, ...base });
    assert.equal(res.status, 403);
    assert.equal(res.body.error, "That billing customer isn't linked to your account.");
    assert.equal(portalParams.length, 0);
  });

  it("refuses a deleted customer", async () => {
    const { stripe, portalParams } = fakeStripe(async () => ({ deleted: true }));
    const res = await openBillingPortal({ stripe, ...base });
    assert.equal(res.status, 403);
    assert.equal(portalParams.length, 0);
  });

  it("refuses a customer with no metadata", async () => {
    const { stripe, portalParams } = fakeStripe(
      async () => ({ id: "cus_x" }) as RetrievedStripeCustomer,
    );
    const res = await openBillingPortal({ stripe, ...base });
    assert.equal(res.status, 403);
    assert.equal(portalParams.length, 0);
  });

  it("fails closed with 502 when retrieve throws", async () => {
    const { stripe, portalParams } = fakeStripe(async () => {
      throw new Error("stripe down");
    });
    const res = await openBillingPortal({ stripe, ...base });
    assert.equal(res.status, 502);
    assert.equal(portalParams.length, 0);
  });

  it("opens the portal for the owner's own customer", async () => {
    const { stripe, portalParams } = fakeStripe(async () => ({
      metadata: { supabase_user_id: "user-a" },
    }));
    const res = await openBillingPortal({ stripe, ...base });
    assert.equal(res.status, 200);
    assert.equal(res.body.url, "https://billing.example/portal");
    assert.equal(portalParams.length, 1);
    assert.deepEqual(portalParams[0], {
      customer: "cus_stored",
      return_url: "https://app.example/dashboard",
    });
  });
});
