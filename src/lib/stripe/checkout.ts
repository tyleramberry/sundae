const CLOSED_STRIPE_STATUSES = new Set(["canceled", "incomplete_expired"]);
const OPEN_CHECKOUT_STATUSES = new Set(["incomplete"]);
// Double-click guard only — cancel_url and a failed sessions.create must
// not strand the user for hours. Two minutes covers a slow redirect to Stripe.
export const IN_FLIGHT_CHECKOUT_LOCK_MS = 2 * 60 * 1000;

export type StripeCustomerLike = {
  id: string;
  metadata?: Record<string, string> | null;
};

// Reuse a Stripe Customer only when it is already tagged as this Sundae
// user. Never fall back to customers.list()[0] — that can be someone else
// who shares an email. Duplicate emails with a new Customer are OK.
export function pickStripeCustomerForUser(
  customers: StripeCustomerLike[],
  userId: string,
): string | null {
  const match = customers.find((c) => c.metadata?.supabase_user_id === userId);
  return match?.id ?? null;
}

export type RetrievedStripeCustomer =
  | { deleted?: unknown; metadata?: Record<string, string> | null }
  | null
  | undefined;

// M3 (SEC-1): a Stripe Customer created by this app is tagged at birth with
// metadata.supabase_user_id (findOrCreateStripeCustomer). That tag is the only
// ownership proof we have, and the stored stripe_customer_id on
// public.subscriptions is client-writable — so a customer we cannot positively
// tie to this user is never handed to a portal or checkout session. A deleted
// customer and a customer with no metadata are both "not ours".
export function stripeCustomerBelongsToUser(
  customer: RetrievedStripeCustomer,
  userId: string,
): boolean {
  if (!customer) return false;
  if (customer.deleted === true) return false;
  return customer.metadata?.supabase_user_id === userId;
}

// Any status other than fully canceled / expired Checkout is still "live"
// on the Stripe customer and must not get a second subscription.
export function hasOpenStripeSubscription(statuses: string[]): boolean {
  return statuses.some((status) => !CLOSED_STRIPE_STATUSES.has(status));
}

export function isRecentIncompleteCheckout(
  status: string | null | undefined,
  updatedAt: string | Date | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!status || !OPEN_CHECKOUT_STATUSES.has(status) || !updatedAt) return false;
  const updated = updatedAt instanceof Date ? updatedAt : new Date(updatedAt);
  if (isNaN(updated.getTime())) return false;
  return now.getTime() - updated.getTime() <= IN_FLIGHT_CHECKOUT_LOCK_MS;
}

export function canPersistPendingCheckoutRow(status: string | null | undefined): boolean {
  if (!status) return true;
  return (
    status === "incomplete" ||
    status === "incomplete_expired" ||
    status === "canceled" ||
    status === "past_due"
  );
}

export function checkoutSessionBelongsToUser(
  session: {
    metadata?: Record<string, string> | null;
    client_reference_id?: string | null;
    customer?: string | { id: string } | null;
  },
  userId: string,
  stripeCustomerId: string | null,
): boolean {
  if (session.metadata?.supabase_user_id === userId) return true;
  if (session.client_reference_id === userId) return true;
  const customer =
    typeof session.customer === "string" ? session.customer : session.customer?.id ?? null;
  return Boolean(stripeCustomerId && customer === stripeCustomerId);
}

export function shouldBlockNewCheckout(existing: {
  status: string;
  updated_at?: string | null;
} | null, now: Date = new Date()): boolean {
  if (!existing) return false;
  if (existing.status === "trialing" || existing.status === "active") return true;
  return isRecentIncompleteCheckout(existing.status, existing.updated_at ?? null, now);
}

export function stripeSubscriptionIsLive(status: string | null | undefined): boolean {
  return status === "trialing" || status === "active";
}

export function checkoutSessionLooksFulfilled(session: {
  status?: string | null;
  payment_status?: string | null;
  subscription?: string | { id: string } | null;
}): boolean {
  const subId =
    typeof session.subscription === "string"
      ? session.subscription
      : session.subscription?.id;
  if (!subId) return false;
  return session.payment_status === "paid" || session.status === "complete";
}

// Checkout Session params for the $7.99/mo plan. Freemium: no
// trial_period_days -- the free sessions are the free tier now, so a
// subscriber is charged at checkout. Card is still collected (it charges
// now). Pure so the "no trial" rule is unit-tested.
export function buildSubscriptionCheckoutParams({
  customerId,
  priceId,
  userId,
  appUrl,
}: {
  customerId: string;
  priceId: string;
  userId: string;
  appUrl: string;
}) {
  const base = appUrl.replace(/\/$/, "");
  return {
    mode: "subscription" as const,
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    subscription_data: {
      metadata: { supabase_user_id: userId },
    },
    success_url: `${base}/subscribe?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${base}/subscribe?checkout=canceled`,
    client_reference_id: userId,
    metadata: { supabase_user_id: userId },
    payment_method_collection: "always" as const,
  };
}
