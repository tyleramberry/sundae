const TYPE_LABEL: Record<string, string> = {
  habit: "Habits",
  goal: "Goals",
  project: "Projects",
};

export type TypeBreakdownRow = {
  type: "habit" | "goal" | "project";
  total: number;
  done: number;
};

// This week's mix by action type (Day 16 "make it cooler" pass) -- a
// different chart shape than the per-role rings, and a different question
// ("what kind of thing am I actually working on this week?" vs "which
// role?"). Counts come from the same /api/dashboard items the rings and
// role-preview tooltips already use, so this can't disagree with them.
// Purely presentational -- rows with nothing planned that type are omitted
// rather than shown as an empty 0/0 bar.
export default function TypeBreakdown({ rows }: { rows: TypeBreakdownRow[] }) {
  const visible = rows.filter((r) => r.total > 0);
  if (visible.length === 0) return null;

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
      <span className="text-xs font-medium uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
        This week's mix
      </span>
      <div className="flex flex-col gap-3">
        {visible.map((row) => {
          const fraction = row.total === 0 ? 0 : row.done / row.total;
          return (
            <div key={row.type} className="flex items-center gap-3">
              <span className="w-16 shrink-0 text-sm text-zinc-700 dark:text-zinc-300">
                {TYPE_LABEL[row.type]}
              </span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                <div
                  className="h-full rounded-full bg-emerald-400 transition-[width] duration-500 dark:bg-emerald-500"
                  style={{ width: `${Math.round(fraction * 100)}%` }}
                />
              </div>
              <span className="w-12 shrink-0 text-right text-sm tabular-nums text-zinc-500 dark:text-zinc-400">
                {row.done}/{row.total}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
