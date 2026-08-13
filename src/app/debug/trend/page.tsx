"use client";

import TrendChart, { type WeekPoint } from "@/components/TrendChart";

// Local Sunday-anchored week math, deliberately not imported from
// lib/google/calendar.ts -- this page renders fixed example numbers with no
// auth and no Supabase call at all, so it stays a pure, standalone render
// of TrendChart rather than a real data path.
function startOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - day);
  return d;
}

function toDateOnly(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function weekStartsAgo(weeksAgo: number): string {
  const d = startOfWeek(new Date());
  d.setDate(d.getDate() - weeksAgo * 7);
  return toDateOnly(d);
}

// Fake but shaped like the real thing: a gap week (nothing planned), an
// overall rise, and the current week live/in-progress -- the range of
// states the real /dashboard/[role]/trend can actually show, in one place,
// without needing six real weeks of history on a real account first.
const EXAMPLE_WEEKS: WeekPoint[] = [
  { weekStart: weekStartsAgo(5), numerator: 4, denominator: 20, percent: 20 },
  { weekStart: weekStartsAgo(4), numerator: 0, denominator: 0, percent: null },
  { weekStart: weekStartsAgo(3), numerator: 9, denominator: 20, percent: 45 },
  { weekStart: weekStartsAgo(2), numerator: 12, denominator: 20, percent: 60 },
  { weekStart: weekStartsAgo(1), numerator: 14, denominator: 18, percent: 78 },
  { weekStart: weekStartsAgo(0), numerator: 7, denominator: 14, percent: 50 },
];

const CURRENT_WEEK_START = weekStartsAgo(0);

export default function TrendDebugPage() {
  return (
    <div className="flex flex-1 flex-col gap-6 bg-zinc-50 p-8 font-sans dark:bg-black">
      <div>
        <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">
          6-week trend — example render
        </h1>
        <p className="mt-1 max-w-lg text-sm text-zinc-500 dark:text-zinc-400">
          TrendChart rendered against hardcoded example data (not your real
          account, nothing written to Supabase) so the full range of states
          is visible in one place: a rising trend, a gap week with nothing
          planned, and the current week live/in-progress. This is the exact
          same component <code>/dashboard/[role]/trend</code> uses with real
          data from <code>/api/dashboard/trend</code>.
        </p>
      </div>

      <div className="max-w-2xl">
        <TrendChart role="Athlete (example)" weeks={EXAMPLE_WEEKS} currentWeekStart={CURRENT_WEEK_START} />
      </div>
    </div>
  );
}
