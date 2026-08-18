import type { SupabaseClient } from "@supabase/supabase-js";
import { getCalendarEvent, startOfWeek } from "@/lib/google/calendar";
import { toDateOnly } from "@/lib/weeklySession/persist";

// Gathers what the daily nudge actually needs to say: what's on the
// calendar today, and which ongoing projects still need a push. This is
// deliberately pure data-fetching, no Claude call here -- see
// src/lib/agents/dailyNudgeAgent.ts for the piece that turns this into
// words. Splitting it this way means the agent can never invent an item:
// it only ever gets to phrase what this module actually found.
//
// Known limitation: "today" is computed against UTC calendar-day
// boundaries, since Sundae doesn't store a per-user timezone yet. A user
// working late at night or early morning local time may see an event
// attributed to the wrong day near midnight UTC.

export type TodayItem = {
  id: string;
  role: string;
  title: string;
  type: "habit" | "goal";
};

export type OngoingProject = {
  id: string;
  role: string;
  title: string;
  percent: number;
};

export type TodayBrief = {
  dateISO: string; // yyyy-mm-dd, UTC
  weekdayLabel: string; // "Tuesday, August 11"
  todayItems: TodayItem[];
  ongoingProjects: OngoingProject[];
};

function isSameUTCDate(a: Date, b: Date): boolean {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
}

// Ongoing projects capped at 3 in the email -- enough to nudge without
// turning the email into a project backlog dump. Sorted by percent
// ascending: the ones with the least progress surface first, since those
// are the ones most likely to stall without a nudge.
const MAX_PROJECTS_IN_BRIEF = 3;

export async function getTodayBrief(
  supabase: SupabaseClient,
  userId: string,
  referenceDate: Date = new Date(),
): Promise<TodayBrief> {
  const weekStart = toDateOnly(startOfWeek(referenceDate));

  const dateISO = referenceDate.toISOString().slice(0, 10);
  const weekdayLabel = referenceDate.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });

  const { data, error } = await supabase
    .from("weekly_items")
    .select("id, role, type, title, done, percent, google_event_id")
    .eq("user_id", userId)
    .eq("week_start", weekStart)
    .is("removed_at", null);

  if (error) {
    throw new Error(`Failed to load this week's items for the daily brief: ${error.message}`);
  }

  const rows = data ?? [];

  const habitGoalCandidates = rows.filter(
    (r) => (r.type === "habit" || r.type === "goal") && !r.done && r.google_event_id,
  );

  const todayItems: TodayItem[] = [];
  for (const row of habitGoalCandidates) {
    try {
      const event = await getCalendarEvent(supabase, userId, row.google_event_id as string);
      if (!event || event.status === "cancelled") continue;

      const startRaw =
        (event as { start?: { dateTime?: string; date?: string } }).start?.dateTime ??
        (event as { start?: { dateTime?: string; date?: string } }).start?.date;
      if (!startRaw) continue;

      const eventDate = new Date(startRaw);
      if (isSameUTCDate(eventDate, referenceDate)) {
        todayItems.push({
          id: row.id as string,
          role: row.role as string,
          title: row.title as string,
          type: row.type as "habit" | "goal",
        });
      }
    } catch {
      // One event lookup failing (revoked token, deleted event) shouldn't
      // sink the whole brief -- skip it, same "one bad row doesn't stop
      // the batch" stance as the reconciliation cron.
      continue;
    }
  }

  const ongoingProjects: OngoingProject[] = rows
    .filter(
      (r) => r.type === "project" && r.percent !== null && (r.percent as number) < 100,
    )
    .map((r) => ({
      id: r.id as string,
      role: r.role as string,
      title: r.title as string,
      percent: r.percent as number,
    }))
    .sort((a, b) => a.percent - b.percent)
    .slice(0, MAX_PROJECTS_IN_BRIEF);

  return { dateISO, weekdayLabel, todayItems, ongoingProjects };
}
