// Billing entitlement. Freemium (PRD event 33822c9f…): there is no app
// trial anymore -- anyone can use Sundae free up to the session limit in
// src/lib/weeklySession/freeTier.ts, and a live subscription removes that
// limit. Legacy card-backed Stripe trials that predate freemium still show
// up as status `trialing` and stay entitled until Stripe converts them.

export type SubscriptionRow = {
  id: string;
  user_id: string;
  stripe_customer_id: string;
  stripe_subscription_id: string | null;
  status: string;
  trial_end: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  created_at: string;
  updated_at: string;
};

const LIVE_STATUSES = new Set(["trialing", "active"]);
const GRACE_STATUSES = new Set(["canceled", "past_due"]);
const MS_PER_DAY = 1000 * 60 * 60 * 24;

export function isBillingEnforced(): boolean {
  // Local/dev without Stripe keys stays ungated (no free-session limit) so
  // the rest of the app is usable. Production always enforces, even if keys
  // were forgotten — better the free limit than unlimited free planning.
  if (process.env.NODE_ENV === "production") return true;
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

function parseDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

export function isSubscriptionEntitled(
  sub: Pick<SubscriptionRow, "status" | "current_period_end"> | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!sub) return false;
  if (LIVE_STATUSES.has(sub.status)) return true;
  if (GRACE_STATUSES.has(sub.status)) {
    const end = parseDate(sub.current_period_end);
    return Boolean(end && end.getTime() > now.getTime());
  }
  return false;
}

// Legacy (dormant): day-6 reminder for pre-freemium card-backed trials.
// Checkout no longer creates trials, so this window empties on its own once
// the last existing trial_end passes -- delete with trialReminder.ts then.
// trial_end is more than 24h away and at most 48h away, so a once-daily
// cron fires once for a 7-day trial (the day before charge).
export function isTrialEndInDay6Window(
  trialEnd: string | Date | null | undefined,
  now: Date = new Date(),
): boolean {
  const end = parseDate(trialEnd);
  if (!end) return false;
  const ms = end.getTime() - now.getTime();
  return ms > MS_PER_DAY && ms <= 2 * MS_PER_DAY;
}

export function trialReminderWindowBounds(now: Date = new Date()): {
  after: string;
  onOrBefore: string;
} {
  return {
    after: new Date(now.getTime() + MS_PER_DAY).toISOString(),
    onOrBefore: new Date(now.getTime() + 2 * MS_PER_DAY).toISOString(),
  };
}
