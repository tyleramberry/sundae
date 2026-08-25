import type { SubscriptionRow } from "@/lib/trial";

// Minimal subscription shape covering both classic (period end on the
// subscription) and basil/dahlia (period end on the first item). Webhook
// mapping must not assume one API version.
export type StripeSubscriptionLike = {
  id: string;
  status: string;
  customer?: string | { id: string } | null;
  trial_end?: number | null;
  cancel_at_period_end?: boolean;
  current_period_end?: number | null;
  metadata?: Record<string, string> | null;
  items?: { data?: Array<{ current_period_end?: number | null }> } | null;
};

export const HANDLED_STRIPE_EVENTS = [
  "checkout.session.completed",
  "customer.subscription.updated",
  "customer.subscription.deleted",
] as const;

export type HandledStripeEvent = (typeof HANDLED_STRIPE_EVENTS)[number];

export function isHandledStripeEvent(type: string): type is HandledStripeEvent {
  return (HANDLED_STRIPE_EVENTS as readonly string[]).includes(type);
}

export function unixSecondsToIso(value: number | null | undefined): string | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return new Date(value * 1000).toISOString();
}

export function stripeExpandableId(
  value: string | { id: string } | null | undefined,
): string | null {
  if (!value) return null;
  if (typeof value === "string") return value;
  return value.id ?? null;
}

export function currentPeriodEndIso(sub: StripeSubscriptionLike): string | null {
  const fromItem = sub.items?.data?.[0]?.current_period_end;
  if (typeof fromItem === "number") return unixSecondsToIso(fromItem);
  return unixSecondsToIso(sub.current_period_end);
}

export type MappedSubscriptionFields = Pick<
  SubscriptionRow,
  | "user_id"
  | "stripe_customer_id"
  | "stripe_subscription_id"
  | "status"
  | "trial_end"
  | "current_period_end"
  | "cancel_at_period_end"
>;

export function mapStripeSubscriptionToRow(
  sub: StripeSubscriptionLike,
  userId: string,
): MappedSubscriptionFields | null {
  const customerId = stripeExpandableId(sub.customer);
  if (!customerId) return null;

  return {
    user_id: userId,
    stripe_customer_id: customerId,
    stripe_subscription_id: sub.id,
    status: sub.status,
    trial_end: unixSecondsToIso(sub.trial_end ?? null),
    current_period_end: currentPeriodEndIso(sub),
    cancel_at_period_end: Boolean(sub.cancel_at_period_end),
  };
}

export class StripeWebhookSignatureError extends Error {
  constructor(message = "Invalid Stripe webhook signature.") {
    super(message);
    this.name = "StripeWebhookSignatureError";
  }
}

export function constructVerifiedStripeEvent(
  stripe: {
    webhooks: {
      constructEvent: (payload: string, header: string, secret: string) => unknown;
    };
  },
  rawBody: string,
  signature: string | null,
  secret: string | undefined,
): unknown {
  if (!secret) {
    throw new Error("STRIPE_WEBHOOK_SECRET is not set.");
  }
  if (!signature) {
    throw new StripeWebhookSignatureError("Missing stripe-signature header.");
  }
  try {
    return stripe.webhooks.constructEvent(rawBody, signature, secret);
  } catch (err) {
    if (err instanceof StripeWebhookSignatureError) throw err;
    throw new StripeWebhookSignatureError(
      err instanceof Error ? err.message : "Invalid Stripe webhook signature.",
    );
  }
}
