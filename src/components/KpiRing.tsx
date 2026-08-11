// A role's weekly KPI as a filling ring (Day 11 dashboard redesign). Empty
// circle at 0/N with the role name + count centered inside; the emerald arc
// grows clockwise from the top as items get logged done, reaching a full
// ring at 100%. Purely presentational -- the dashboard wraps it in the link
// that deep-links into the follow-ups page. Numerator/denominator/percent
// come straight from lib/kpi/compute so this can never disagree with the
// follow-ups math.
export default function KpiRing({
  role,
  numerator,
  denominator,
  percent,
  size = 148,
}: {
  role: string;
  numerator: number;
  denominator: number;
  percent: number | null;
  size?: number;
}) {
  const stroke = 10;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const fraction = denominator === 0 ? 0 : numerator / denominator;
  const offset = c * (1 - fraction);
  const complete = denominator > 0 && numerator >= denominator;

  return (
    <div
      className="relative"
      style={{ width: size, height: size }}
      role="img"
      aria-label={`${role}: ${numerator} of ${denominator} done${percent !== null ? `, ${percent}%` : ""}`}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          className="stroke-zinc-200 dark:stroke-zinc-800"
        />
        {fraction > 0 && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={offset}
            className={
              complete
                ? "stroke-emerald-500 transition-[stroke-dashoffset] duration-500"
                : "stroke-emerald-400 transition-[stroke-dashoffset] duration-500"
            }
          />
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-0.5 px-4 text-center">
        <span className="line-clamp-2 text-sm font-semibold leading-tight text-black dark:text-zinc-50">
          {role}
        </span>
        <span className="text-lg font-semibold tabular-nums text-zinc-500 dark:text-zinc-400">
          {numerator}/{denominator}
        </span>
      </div>
    </div>
  );
}
