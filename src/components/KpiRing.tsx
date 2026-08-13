// A role's weekly KPI as a filling ring (Day 16 all-rings-at-once redesign).
// Empty circle at 0/N with just the count centered inside -- the role name
// now lives above the ring as its own hover target (see dashboard/page.tsx),
// so it isn't duplicated here. The emerald arc grows clockwise from the top
// to the role's live percentage. Purely presentational -- the dashboard
// wraps this in the link to that role's 6-week trend page and puts the
// "group/ring" hover scope on that link, which is what replays the fill
// below via the ring-fill keyframe (globals.css). Numerator/denominator/
// percent come straight from lib/kpi/compute so this can never disagree
// with the follow-ups math.
export default function KpiRing({
  role,
  numerator,
  denominator,
  percent,
  size = 132,
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
      style={{
        width: size,
        height: size,
        // Consumed by the ring-fill keyframe in globals.css -- CSS custom
        // properties inherit down to the circle below regardless of where
        // the hover (group/ring) that triggers the animation is scoped.
        "--ring-circumference": `${c}`,
        "--ring-offset": `${offset}`,
      } as React.CSSProperties}
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
            className={[
              complete ? "stroke-emerald-500" : "stroke-emerald-400",
              "transition-[stroke-dashoffset] duration-500",
              // Hovering the wrapping link (group/ring) replays the fill
              // from empty -> the target offset each time, rather than
              // just sitting there statically.
              "motion-safe:group-hover/ring:animate-[ring-fill_0.6s_ease-out]",
            ].join(" ")}
          />
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-0.5 px-4 text-center">
        <span className="text-xl font-semibold tabular-nums text-black dark:text-zinc-50">
          {numerator}/{denominator}
        </span>
      </div>
    </div>
  );
}
