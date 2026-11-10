import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  portalUrlForCustomer,
  runCheckout,
  type CheckoutStripeClient,
} from "./route";
import type { RetrievedStripeCustomer } from "@/lib/stripe/checkout";
import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

function fakeStripe(opts: {
  customer?: RetrievedStripeCustomer;
  subs?: string[];
  retrieveThrows?: boolean;
}) {
  const calls = {
    retrieve: 0,
    create: 0,
    portal: 0,
    sessions: [] as unknown[],
  };
  const stripe: CheckoutStripeClient = {
    customers: {
      async retrieve() {
        calls.retrieve++;
        if (opts.retrieveThrows) throw new Error("stripe down");
        return opts.customer ?? null;
      },
      async list() {
        return { data: [] };
      },
      async create() {
        calls.create++;
        return { id: "cus_fresh" };
      },
    },
    subscriptions: {
      async list() {
        return { data: (opts.subs ?? []).map((status) => ({ status })) };
      },
    },
    checkout: {
      sessions: {
        async create(params) {
          calls.sessions.push(params);
          return { url: "https://checkout.example/s" };
        },
      },
    },
    billingPortal: {
      sessions: {
        async create() {
          calls.portal++;
          return { url: "https://billing.example/portal" };
        },
      },
    },
  };
  return { stripe, calls };
}

function fakeSupabase() {
  const upserts: unknown[] = [];
  const supabase = {
    from() {
      return {
        upsert: async (row: unknown) => {
          upserts.push(row);
          return { error: null };
        },
        update: () => ({
          eq: () => ({ eq: async () => ({ error: null }) }),
        }),
      };
    },
  } as unknown as Supabase;
  return { supabase, upserts };
}

const user = { id: "user-a", email: "a@example.com" };
const run = (
  stripe: CheckoutStripeClient,
  supabase: Supabase,
  existing: { status: string | null; stripe_customer_id: string | null; updated_at: string | null } | null,
) =>
  runCheckout({
    stripe,
    supabase,
    user,
    appUrl: "https://app.example",
    priceId: "price_1",
    fromLimit: false,
    existing,
    capture: async () => {},
  });

describe("runCheckout customer binding", () => {
  it("never reuses a stored foreign customer id", async () => {
    const { stripe, calls } = fakeStripe({
      customer: { metadata: { supabase_user_id: "user-b" } },
    });
    const { supabase, upserts } = fakeSupabase();
    const res = await run(stripe, supabase, {
      status: "canceled",
      stripe_customer_id: "cus_foreign",
      updated_at: null,
    });
    assert.equal(res.status, 200);
    assert.equal(calls.sessions.length, 1);
    const params = calls.sessions[0] as { customer: string };
    assert.equal(params.customer, "cus_fresh");
    assert.notEqual(params.customer, "cus_foreign");
    assert.equal(calls.create, 1);
    assert.equal(calls.portal, 0);
    assert.equal(upserts.length, 0);
  });

  it("reuses the stored id when it is the user's own", async () => {
    const { stripe, calls } = fakeStripe({
      customer: { metadata: { supabase_user_id: "user-a" } },
    });
    const { supabase, upserts } = fakeSupabase();
    const res = await run(stripe, supabase, {
      status: "canceled",
      stripe_customer_id: "cus_mine",
      updated_at: null,
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.url, "https://checkout.example/s");
    assert.equal(calls.sessions.length, 1);
    assert.equal((calls.sessions[0] as { customer: string }).customer, "cus_mine");
    assert.equal(calls.create, 0);
    assert.equal(upserts.length, 1);
  });

  it("fails closed to a fresh customer when the stored id cannot be verified", async () => {
    const { stripe, calls } = fakeStripe({ retrieveThrows: true });
    const { supabase, upserts } = fakeSupabase();
    const res = await run(stripe, supabase, {
      status: "canceled",
      stripe_customer_id: "cus_foreign",
      updated_at: null,
    });
    assert.equal(res.status, 200);
    assert.equal(calls.sessions.length, 1);
    assert.equal((calls.sessions[0] as { customer: string }).customer, "cus_fresh");
    assert.equal(upserts.length, 0);
  });

  it("still 409s when the customer already has an open subscription", async () => {
    const { stripe, calls } = fakeStripe({
      customer: { metadata: { supabase_user_id: "user-a" } },
      subs: ["active"],
    });
    const { supabase } = fakeSupabase();
    const res = await run(stripe, supabase, {
      status: "active",
      stripe_customer_id: "cus_mine",
      updated_at: null,
    });
    assert.equal(res.status, 409);
    assert.equal(calls.sessions.length, 0);
  });
});

describe("portalUrlForCustomer", () => {
  it("refuses a customer that isn't the user's", async () => {
    const { stripe, calls } = fakeStripe({
      customer: { metadata: { supabase_user_id: "user-b" } },
    });
    assert.equal(await portalUrlForCustomer(stripe, "cus_foreign", "user-a"), null);
    assert.equal(calls.portal, 0);
  });

  it("returns the portal url for the user's own customer", async () => {
    const { stripe, calls } = fakeStripe({
      customer: { metadata: { supabase_user_id: "user-a" } },
    });
    assert.equal(
      await portalUrlForCustomer(stripe, "cus_mine", "user-a"),
      "https://billing.example/portal",
    );
    assert.equal(calls.portal, 1);
  });
});
