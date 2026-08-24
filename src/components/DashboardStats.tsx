// Headline stat row (Day 16 "make it cooler" pass) -- the account-wide
// numbers that don't fit inside any one role's ring: this week's weekly-
// planning streak, last week's pooled completion rate, and the 6-week
// pooled average. Pure presentation; the pooling math lives in
// /api/dashboard/summary so the dashboard page never disagrees with the
// trend view about what "done" means. `null` on a percent means "no data"
// (nothing planned that week), same distinction the rings and trend chart
// already make -- shown as a dash, not 0%.
export type DashboardSummary = {
  streakWeeks: number;
  lastWeekPercent: number | null;
  sixWeekAveragePercent: number | null;
  // Spec #2 hero. `masterScore` is live-computed from this week's items
  // for a fresh number; `masterScoreHistory` is prior-weeks' persisted
  // scores (oldest first) that the Sparkline consumer appends the live
  // masterScore onto as its final point.
  masterScore: number;
  masterScoreHistory: { weekStart: string; masterScore: number }[];
};

function StatCard({
  label,
  value,
  sublabel,
}: {
  label: string;
  value: string;
  sublabel?: string;
}) {
  return (
    <div className="flex flex-1 flex-col gap-1 rounded-2xl border border-zinc-200 bg-white px-5 py-4 dark:border-zinc-800 dark:bg-zinc-950">
      <span className="text-xs font-medium uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
        {label}
      </span>
      <span className="text-3xl font-semibold tabular-nums text-black dark:text-zinc-50">
        {value}
      </span>
      {sublabel && (
        <span className="text-xs text-zinc-400 dark:text-zinc-500">{sublabel}</span>
      )}
    </div>
  );
}

export default function DashboardStats({ summary }: { summary: DashboardSummary | null }) {
  const streak = summary?.streakWeeks ?? null;
  const lastWeek = summary?.lastWeekPercent ?? null;
  const sixWeekAvg = summary?.sixWeekAveragePercent ?? null;

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <StatCard
        label="Streak"
        value={streak === null ? "–" : `${streak}`}
        sublabel={streak === null ? undefined : streak === 1 ? "week" : "weeks running"}
      />
      <StatCard
        label="Last week"
        value={lastWeek === null ? "–" : `${lastWeek}%`}
        sublabel={lastWeek === null ? "nothing planned" : "completion rate"}
      />
      <StatCard
        label="6-week average"
        value={sixWeekAvg === null ? "–" : `${sixWeekAvg}%`}
        sublabel={sixWeekAvg === null ? undefined : "across every role"}
      />
    </div>
  );
}
