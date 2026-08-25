const CLOSED_STRIPE_STATUSES = new Set(["canceled", "incomplete_expired"]);
const OPEN_CHECKOUT_STATUSES = new Set(["incomplete"]);
const STALE_INCOMPLETE_MS = 24 * 60 * 60 * 1000;

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
  return now.getTime() - updated.getTime() <= STALE_INCOMPLETE_MS;
}

export function shouldBlockNewCheckout(existing: {
  status: string;
  updated_at?: string | null;
} | null, now: Date = new Date()): boolean {
  if (!existing) return false;
  if (existing.status === "trialing" || existing.status === "active") return true;
  return isRecentIncompleteCheckout(existing.status, existing.updated_at ?? null, now);
}
