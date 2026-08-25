// Trial / subscription status. getTrialStatus is the pre-Stripe fallback
// (7 days from auth user.created_at). Once a `subscriptions` row exists,
// callers should prefer getSubscriptionStatus so copy and entitlement
// follow Stripe, not account age.

export type TrialStatus = {
  day: number; // 1-based, capped at 7
  daysRemaining: number;
  isActive: boolean;
  // True while the user is in a Stripe (or fallback) trial window. Paid
  // active subscribers keep isActive but this is false so copy doesn't
  // still read as a trial.
  isTrialing: boolean;
  endDate: string; // e.g. "Aug 28" for display
  createdAt: string | null;
};

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

export type BillingEnv = {
  STRIPE_SECRET_KEY?: string;
  STRIPE_PRICE_ID?: string;
};

function billingEnv(env?: BillingEnv): BillingEnv {
  return (
    env ?? {
      STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
      STRIPE_PRICE_ID: process.env.STRIPE_PRICE_ID,
    }
  );
}

export function isBillingConfigured(env?: BillingEnv): boolean {
  const { STRIPE_SECRET_KEY, STRIPE_PRICE_ID } = billingEnv(env);
  return Boolean(STRIPE_SECRET_KEY && STRIPE_PRICE_ID);
}

export function isBillingEnforced(env?: BillingEnv): boolean {
  // Checkout needs both STRIPE_SECRET_KEY and STRIPE_PRICE_ID. Gating
  // without them (including production with forgotten keys) bricks signup
  // behind a subscribe page that always 500s. Only enforce when Checkout
  // can actually run; the 7-day account-age trial still applies.
  return isBillingConfigured(env);
}

function parseDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

function formatEndDate(d: Date): string {
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export function getTrialStatus(createdAt: string | Date | null | undefined): TrialStatus {
  if (!createdAt) {
    return {
      day: 1,
      daysRemaining: 6,
      isActive: true,
      isTrialing: true,
      endDate: "",
      createdAt: null,
    };
  }

  const start = new Date(createdAt);
  if (isNaN(start.getTime())) {
    return {
      day: 1,
      daysRemaining: 6,
      isActive: true,
      isTrialing: true,
      endDate: "",
      createdAt: null,
    };
  }

  const now = new Date();
  const daysSince = Math.floor((now.getTime() - start.getTime()) / MS_PER_DAY) + 1;

  const day = Math.max(1, Math.min(daysSince, 7));
  const daysRemaining = Math.max(0, 7 - daysSince);
  // A 7-day trial ends when the 7th day ends, not when it starts, so Day 7
  // (daysSince === 7, daysRemaining === 0) is still active -- that's the
  // day formatTrialFooter shows "Last day of your free trial."
  const isActive = daysSince <= 7;

  const end = new Date(start.getTime());
  end.setDate(end.getDate() + 7);

  return {
    day,
    daysRemaining,
    isActive,
    isTrialing: isActive,
    endDate: formatEndDate(end),
    createdAt: start.toISOString(),
  };
}

export function getSubscriptionStatus(
  sub: Pick<SubscriptionRow, "status" | "trial_end" | "current_period_end" | "created_at">,
  now: Date = new Date(),
): TrialStatus {
  const trialEnd = parseDate(sub.trial_end);
  const periodEnd = parseDate(sub.current_period_end);
  const inTrialByDate = Boolean(trialEnd && trialEnd.getTime() > now.getTime());
  const isTrialing = sub.status === "trialing" || (sub.status === "active" && inTrialByDate);

  if (isTrialing && trialEnd) {
    const msLeft = trialEnd.getTime() - now.getTime();
    const daysRemaining = Math.max(0, Math.ceil(msLeft / MS_PER_DAY));
    const day = daysRemaining === 0 ? 7 : Math.max(1, Math.min(7, 8 - daysRemaining));
    return {
      day,
      daysRemaining,
      isActive: sub.status === "trialing" || msLeft > 0,
      isTrialing: true,
      endDate: formatEndDate(trialEnd),
      createdAt: sub.created_at ?? null,
    };
  }

  return {
    day: 7,
    daysRemaining: 0,
    isActive: isSubscriptionEntitled(sub, now),
    isTrialing: false,
    endDate: periodEnd ? formatEndDate(periodEnd) : trialEnd ? formatEndDate(trialEnd) : "",
    createdAt: sub.created_at ?? null,
  };
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

// Day-6 reminder: trial_end is more than 24h away and at most 48h away, so
// a once-daily cron fires once for a 7-day trial (the day before charge).
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

export function formatTrialStatus(status: TrialStatus): string {
  if (status.isTrialing && status.isActive) return `Day ${status.day} of 7 — trial active`;
  if (status.isActive) return "Subscription active";
  return "Trial ended";
}

export function formatTrialFooter(status: TrialStatus): string {
  if (status.isTrialing) {
    if (!status.isActive) return "Your free trial has ended. Manage in Settings.";
    if (status.daysRemaining === 0) return "Last day of your free trial. Cancel anytime from Settings.";
    return `${status.daysRemaining} ${status.daysRemaining === 1 ? "day" : "days"} remaining in your free trial. Cancel anytime from Settings — no hoops.`;
  }
  if (status.isActive) return "Cancel anytime from Settings — no hoops.";
  return "Your free trial has ended. Manage in Settings.";
}
