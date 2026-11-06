import type { SupabaseClient } from "@supabase/supabase-js";
import { isBillingEnforced, isSubscriptionEntitled, type SubscriptionRow } from "@/lib/billing";
import type { WeeklySessionTranscriptRow } from "@/lib/weeklySession/persist";

// Freemium gate (PRD event 33822c9f…): anyone can sign up and plan for free
// for FREE_SESSION_LIMIT completed weekly sessions; starting the next new
// full session needs a live subscription. Enforced server-side by the
// weekly-session routes -- the engine (src/lib/engine/*) never sees any of
// this, it stays channel-agnostic.
//
// A "completed session" is a week whose first confirm landed, i.e. a
// weekly_session_transcripts row with completed_at set. That table is
// unique on (user_id, week_start) and only the week's first confirm sets
// completed_at (recordWeeklySessionConfirmed in persist.ts), so the count
// can't be inflated by re-confirming or reset by the client. No counter
// column, no migration.

export const FREE_SESSION_LIMIT = 2;

export const FREE_LIMIT_CODE = "free_limit_reached";

export type FreeTierAccess = {
  entitled: boolean;
  completedSessions: number;
  limit: number;
  canStartNewSession: boolean;
};

// Pure: no Supabase, no Next. Entitlement reuses the existing billing rule
// (trialing/active, or canceled/past_due still inside current_period_end),
// so legacy card-backed trials stay unlimited untouched.
export function getFreeTierAccess({
  subscription,
  completedSessions,
  now = new Date(),
}: {
  subscription: Pick<SubscriptionRow, "status" | "current_period_end"> | null | undefined;
  completedSessions: number;
  now?: Date;
}): FreeTierAccess {
  const entitled = isSubscriptionEntitled(subscription, now);
  const count = Math.max(0, Math.floor(completedSessions));
  return {
    entitled,
    completedSessions: count,
    limit: FREE_SESSION_LIMIT,
    canStartNewSession: entitled || count < FREE_SESSION_LIMIT,
  };
}

// Pure: whether the free limit blocks this particular request. Only a
// brand-new *full* session is gated -- an in-progress round (turns already
// on the transcript) can always finish, even if a subscription lapsed
// mid-session, and addendum rounds in an already-completed week are free
// and unlimited.
export function isNewSessionBlocked(
  access: Pick<FreeTierAccess, "canStartNewSession">,
  round: { weekCompleted: boolean; roundTurnCount: number },
): boolean {
  if (access.canStartNewSession) return false;
  if (round.weekCompleted) return false;
  return round.roundTurnCount === 0;
}

export function freeLimitBody(access: Pick<FreeTierAccess, "completedSessions" | "limit">) {
  return {
    error: `You've used your ${access.limit} free planning sessions. Subscribe to keep planning.`,
    code: FREE_LIMIT_CODE,
    completedSessions: access.completedSessions,
    limit: access.limit,
  };
}

export async function countCompletedSessions(
  supabase: SupabaseClient,
  userId: string,
): Promise<number> {
  const { count, error } = await supabase
    .from("weekly_session_transcripts")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .not("completed_at", "is", null);

  if (error) {
    throw new Error(`Failed to count completed weekly sessions: ${error.message}`);
  }
  return count ?? 0;
}

// Loads subscription + completed count with the caller's user-scoped
// client (RLS select-own on both tables) and applies the pure rule. When
// billing isn't enforced (local dev without Stripe keys) everything stays
// open, same as the old subscription gate. Returns `enforced` so UI can
// skip plan copy in that case.
export async function loadFreeTierAccess(
  supabase: SupabaseClient,
  userId: string,
): Promise<FreeTierAccess & { enforced: boolean }> {
  const [{ data: sub, error: subError }, completedSessions] = await Promise.all([
    supabase
      .from("subscriptions")
      .select("status, current_period_end")
      .eq("user_id", userId)
      .maybeSingle(),
    countCompletedSessions(supabase, userId),
  ]);

  if (subError) {
    throw new Error(`Failed to load subscription: ${subError.message}`);
  }

  const access = getFreeTierAccess({
    subscription: sub as Pick<SubscriptionRow, "status" | "current_period_end"> | null,
    completedSessions,
  });

  if (!isBillingEnforced()) {
    return { ...access, canStartNewSession: true, enforced: false };
  }
  return { ...access, enforced: true };
}

// Pure: the round facts isNewSessionBlocked needs, read off this week's
// transcript row (null = no session at all this week yet).
export function roundStateOf(
  transcript: Pick<WeeklySessionTranscriptRow, "completed_at" | "active_state"> | null | undefined,
): { weekCompleted: boolean; roundTurnCount: number } {
  return {
    weekCompleted: Boolean(transcript?.completed_at),
    roundTurnCount: transcript?.active_state?.turns?.length ?? 0,
  };
}

// Route-layer guard shared by /step, /propose, /revise and /confirm: returns
// the 402 body when this request would drive a brand-new full session past
// the free limit, else null. In-progress rounds and addendum weeks skip the
// billing lookup entirely. /propose, /revise and /confirm take the plan from
// the request body rather than from a step-created transcript, so without
// this a free user at the limit could POST them directly and get a planned
// (and calendar-written) week without ever opening a session.
export async function getFreeLimitBlock(
  supabase: SupabaseClient,
  userId: string,
  transcript: Pick<WeeklySessionTranscriptRow, "completed_at" | "active_state"> | null | undefined,
): Promise<ReturnType<typeof freeLimitBody> | null> {
  const round = roundStateOf(transcript);
  if (round.weekCompleted || round.roundTurnCount > 0) return null;
  const access = await loadFreeTierAccess(supabase, userId);
  return isNewSessionBlocked(access, round) ? freeLimitBody(access) : null;
}

// What the sidebar / dashboard show about the user's plan. null when
// billing isn't enforced (local dev without Stripe), so no plan copy.
export type PlanSummary =
  | { kind: "free"; completedSessions: number; limit: number }
  | { kind: "subscriber" };

export function planSummaryOf(access: FreeTierAccess & { enforced: boolean }): PlanSummary | null {
  if (!access.enforced) return null;
  if (access.entitled) return { kind: "subscriber" };
  return { kind: "free", completedSessions: access.completedSessions, limit: access.limit };
}

// "Free plan · 1 of 2 sessions used". Capped at the limit so a lapsed
// subscriber with five completed weeks doesn't read "5 of 2".
export function formatFreePlanUsage(plan: { completedSessions: number; limit: number }): string {
  const used = Math.min(plan.completedSessions, plan.limit);
  return `Free plan · ${used} of ${plan.limit} sessions used`;
}
