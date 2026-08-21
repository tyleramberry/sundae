// Trial status computation. Trial is 7 days from Supabase auth user.created_at.
// One source of truth for the four trust signals (landing copy, onboarding screen,
// dashboard indicator, daily email footer). No Stripe table yet, so this is
// the proxy until billing is wired.

export type TrialStatus = {
  day: number; // 1-based, capped at 7
  daysRemaining: number;
  isActive: boolean;
  endDate: string; // e.g. "Aug 28" for display
  createdAt: string | null;
};

export function getTrialStatus(createdAt: string | Date | null | undefined): TrialStatus {
  if (!createdAt) {
    return {
      day: 1,
      daysRemaining: 6,
      isActive: true,
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
      endDate: "",
      createdAt: null,
    };
  }

  const now = new Date();
  const msPerDay = 1000 * 60 * 60 * 24;
  const daysSince = Math.floor((now.getTime() - start.getTime()) / msPerDay) + 1;

  const day = Math.max(1, Math.min(daysSince, 7));
  const daysRemaining = Math.max(0, 7 - daysSince);
  // A 7-day trial ends when the 7th day ends, not when it starts, so Day 7
  // (daysSince === 7, daysRemaining === 0) is still active -- that's the
  // day formatTrialFooter shows "Last day of your free trial."
  const isActive = daysSince <= 7;

  const end = new Date(start.getTime());
  end.setDate(end.getDate() + 7);
  const endDate = end.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });

  return {
    day,
    daysRemaining,
    isActive,
    endDate,
    createdAt: start.toISOString(),
  };
}

export function formatTrialStatus(status: TrialStatus): string {
  if (!status.isActive) return "Trial ended";
  return `Day ${status.day} of 7 — trial active`;
}

export function formatTrialFooter(status: TrialStatus): string {
  if (!status.isActive) return "Your free trial has ended. Manage in Settings.";
  if (status.daysRemaining === 0) return "Last day of your free trial. Cancel anytime from Settings.";
  return `${status.daysRemaining} ${status.daysRemaining === 1 ? "day" : "days"} remaining in your free trial. Cancel anytime from Settings — no hoops.`;
}
