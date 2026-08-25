export type SubscriptionPreviousAttributes = {
  status?: string;
  trial_end?: unknown;
};

// Stripe fires many subscription.updated events. Only count a trial → paid
// conversion when status becomes active and it was not already active.
export function isTrialConvertedToActive(
  currentStatus: string,
  previousAttributes: SubscriptionPreviousAttributes | null | undefined,
): boolean {
  if (currentStatus !== "active") return false;
  if (!previousAttributes) return false;
  if (previousAttributes.status === "active") return false;
  if (previousAttributes.status === "trialing") return true;
  // Status omitted; trial_end appearing in previous_attributes means it
  // changed (typically cleared) as the trial ended.
  return Object.prototype.hasOwnProperty.call(previousAttributes, "trial_end");
}
