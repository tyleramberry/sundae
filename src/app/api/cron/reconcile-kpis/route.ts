import { NextResponse } from "next/server";
import { isAuthorizedCronRequest, unauthorizedCronResponse } from "@/lib/cron/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCalendarEvent, startOfWeek } from "@/lib/google/calendar";
import { toDateOnly } from "@/lib/weeklySession/persist";

// Day 11 KPI reconciliation job. Runs once a day (same Vercel Cron trigger
// as the daily follow-up email, see vercel.json) and closes the one gap
// left by Day 10's wiring: a user can delete/decline a confirmed Habit or
// Goal event straight from Google Calendar, and nothing in the app ever
// finds out -- that item would sit in `weekly_items` as not-done forever,
// permanently dragging down its role's KPI denominator for a block that no
// longer exists. This walks every not-yet-done item with a real calendar
// event attached, checks whether that event is still live, and marks
// `removed_at` on the ones that aren't. Only touches the current week's
// not-yet-done items -- already-done items and past weeks are never
// revisited, per the Day 11 spec.
export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return unauthorizedCronResponse();
  }

  const supabase = createAdminClient();
  const weekStart = toDateOnly(startOfWeek(new Date()));

  const { data: candidates, error } = await supabase
    .from("weekly_items")
    .select("id, user_id, google_event_id")
    .eq("week_start", weekStart)
    .in("type", ["habit", "goal"])
    .eq("done", false)
    .is("removed_at", null)
    .not("google_event_id", "is", null);

  if (error) {
    console.error("Reconcile-KPIs: failed to load candidates:", error);
    return NextResponse.json({ error: "Failed to load weekly_items" }, { status: 500 });
  }

  const rows = candidates ?? [];
  const idsToRemove: string[] = [];
  const failures: { userId: string; itemCount: number; message: string }[] = [];

  // Group by user so we resolve/refresh each user's Google access token
  // once instead of once per event.
  const byUser = new Map<string, { id: string; google_event_id: string }[]>();
  for (const row of rows) {
    const list = byUser.get(row.user_id) ?? [];
    list.push({ id: row.id, google_event_id: row.google_event_id as string });
    byUser.set(row.user_id, list);
  }

  for (const [userId, items] of byUser) {
    // Catch at the per-user boundary, not per-item: the dominant failure
    // mode is a revoked/expired token, which would throw identically for
    // every item and produce N duplicate log lines + N redundant refresh
    // attempts. Skip the rest of this user's items on the first throw and
    // move on to the next user -- same batch-doesn't-die stance as before,
    // just at the right granularity.
    try {
      for (const item of items) {
        const event = await getCalendarEvent(supabase, userId, item.google_event_id);
        if (!event || event.status === "cancelled") {
          idsToRemove.push(item.id);
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(
        `Reconcile-KPIs: failed for user ${userId} (${items.length} items skipped):`,
        message,
      );
      failures.push({ userId, itemCount: items.length, message });
    }
  }

  if (idsToRemove.length > 0) {
    const { error: updateError } = await supabase
      .from("weekly_items")
      .update({ removed_at: new Date().toISOString() })
      .in("id", idsToRemove);

    if (updateError) {
      console.error("Reconcile-KPIs: failed to mark removed_at:", updateError);
      return NextResponse.json(
        { error: "Failed to update removed_at", removed: 0, checked: rows.length },
        { status: 500 },
      );
    }
  }

  return NextResponse.json({
    weekStart,
    checked: rows.length,
    removed: idsToRemove.length,
    failures,
  });
}
