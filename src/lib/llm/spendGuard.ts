import type { SupabaseClient } from "@supabase/supabase-js";

// The one per-user LLM spend control. SEC-1 finding M2: the engine route
// trusted a turn count the *client* supplied as its only bound on Claude
// spend, and the weekly-session route's once-a-day throttle only covers
// starting a fresh full session, so a signed-in account could loop real
// Claude calls forever (addendum rounds, or an engine call that just sends
// an empty `state` every time). Every route that calls Claude on a user's
// behalf reserves a row here first; the count of those rows is the bound.
//
// Sizing: the per-round TURN_CAP is 150 (src/lib/weeklySession/throttle.ts)
// and a real user has already hit 51 turns in a single 7-role session, so
// the hourly ceiling has to sit clearly above one legitimately long
// multi-role session -- a guard that blocks real usage is not a fix. 200 per
// hour and 600 per day leaves that session untouched while still keeping a
// scripted loop bounded, which is the entire point of the finding.
//
// This is the single shared counter for the whole repo. Later routes that
// spend Claude tokens must call enforceLlmSpend, not grow a second counter
// of their own -- two counters drift and the real total stops meaning
// anything.
//
// The row is written *before* the Claude call, so a crash or timeout
// mid-call still counts against the user. A call that trips the limit
// writes nothing: a blocked loop cannot inflate its own counter, and the
// window drains on its own once the older rows age out.

export const LLM_SPEND_HOURLY_LIMIT = 200;
export const LLM_SPEND_DAILY_LIMIT = 600;
export const LLM_SPEND_WINDOW_MS = 60 * 60 * 1000;
export const LLM_SPEND_DAY_MS = 24 * 60 * 60 * 1000;
export const LLM_SPEND_LIMIT_CODE = "llm_rate_limited";

export type LlmSpendCounts = { hourly: number; daily: number };
export type LlmSpendLimitBody = { error: string; code: string };

export function spendWindowStarts(
  now: Date,
  hourMs = LLM_SPEND_WINDOW_MS,
  dayMs = LLM_SPEND_DAY_MS,
): { hourlyStart: string; dailyStart: string } {
  return {
    hourlyStart: new Date(now.getTime() - hourMs).toISOString(),
    dailyStart: new Date(now.getTime() - dayMs).toISOString(),
  };
}

// Counts are read before this call reserves its own row, so `>=` means "this
// call would be the Nth+1 in the window": exactly 200 an hour / 600 a day are
// allowed and the 201st / 601st is the one that trips.
export function isOverSpendLimit(counts: LlmSpendCounts): boolean {
  return (
    counts.hourly >= LLM_SPEND_HOURLY_LIMIT || counts.daily >= LLM_SPEND_DAILY_LIMIT
  );
}

export function spendLimitBody(counts: LlmSpendCounts): LlmSpendLimitBody {
  const window = counts.hourly >= LLM_SPEND_HOURLY_LIMIT ? "hour" : "day";
  return {
    error: `You've hit the planning assistant's usage limit for this ${window} -- please try again shortly.`,
    code: LLM_SPEND_LIMIT_CODE,
  };
}

// Fails closed, same convention as weeklySession/throttle.ts: if Supabase
// can't tell us the count we throw rather than assume zero, because a silent
// 0 would turn a database hiccup into an open Claude tap.
export async function countRecentLlmCalls(
  supabase: SupabaseClient,
  userId: string,
  now: Date = new Date(),
): Promise<LlmSpendCounts> {
  const { hourlyStart, dailyStart } = spendWindowStarts(now);

  const countSince = async (windowStart: string): Promise<number> => {
    const { count, error } = await supabase
      .from("llm_call_events")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("created_at", windowStart);
    if (error) {
      throw new Error(`Failed to check LLM spend: ${error.message}`);
    }
    return count ?? 0;
  };

  const [hourly, daily] = await Promise.all([
    countSince(hourlyStart),
    countSince(dailyStart),
  ]);
  return { hourly, daily };
}

export async function recordLlmCall(
  supabase: SupabaseClient,
  userId: string,
  route: string,
): Promise<void> {
  const { error } = await supabase
    .from("llm_call_events")
    .insert({ user_id: userId, route });
  if (error) {
    throw new Error(`Failed to record LLM call: ${error.message}`);
  }
}

// Returns the 429 body when the user is over a ceiling (and records nothing),
// or null after reserving this call's row -- callers go on to Claude only on
// null.
export async function enforceLlmSpend(
  supabase: SupabaseClient,
  userId: string,
  route: string,
  options: { now?: Date } = {},
): Promise<LlmSpendLimitBody | null> {
  const counts = await countRecentLlmCalls(supabase, userId, options.now);
  if (isOverSpendLimit(counts)) return spendLimitBody(counts);
  await recordLlmCall(supabase, userId, route);
  return null;
}
