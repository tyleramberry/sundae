"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type WeekPoint = {
  weekStart: string;
  numerator: number;
  denominator: number;
  percent: number | null; // null = nothing planned that week ("no data")
};

type Load = "checking" | "loading" | "ready" | "error";

function formatWeekLabel(weekStart: string): string {
  // week_start is a plain date string (yyyy-mm-dd) -- parse as UTC so the
  // label doesn't shift a day depending on the viewer's timezone.
  const d = new Date(`${weekStart}T00:00:00Z`);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

// The 6-week trend view (Day 15). A bar per week, height = that week's
// completion percentage, with a line connecting the weeks that actually
// have data -- a "no data" week (nothing planned) gets a dashed outline
// bar and breaks the line rather than reading as a 0% week, per the MVP
// spec. Reuses the exact same /api/dashboard/trend numbers the dashboard
// tile's live percentage comes from, just grouped by week instead of only
// the current one.
export default function TrendPage({ params }: { params: Promise<{ role: string }> }) {
  const { role: roleParam } = use(params);
  const role = decodeURIComponent(roleParam);

  const router = useRouter();
  const [load, setLoad] = useState<Load>("checking");
  const [weeks, setWeeks] = useState<WeekPoint[]>([]);
  const [currentWeekStart, setCurrentWeekStart] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.replace(`/login?next=/dashboard/${encodeURIComponent(role)}/trend`);
        return;
      }
      setLoad("loading");
      const res = await fetch(`/api/dashboard/trend?role=${encodeURIComponent(role)}`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error ?? "Couldn't load this role's trend.");
        setLoad("error");
        return;
      }
      setWeeks(body.weeks ?? []);
      setCurrentWeekStart(body.currentWeekStart ?? null);
      setLoad("ready");
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role]);

  if (load === "checking" || load === "loading") {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Loading…</p>
      </div>
    );
  }

  // Chart geometry -- fixed viewBox, columns spaced evenly across it.
  const W = 640;
  const H = 260;
  const padL = 34;
  const padR = 16;
  const padT = 16;
  const padB = 34;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const n = Math.max(weeks.length, 1);
  const colW = plotW / n;
  const barW = Math.min(40, colW * 0.5);

  const xFor = (i: number) => padL + colW * i + colW / 2;
  const yFor = (percent: number) => padT + plotH * (1 - percent / 100);

  const dataPoints = weeks
    .map((w, i) => (w.percent === null ? null : { x: xFor(i), y: yFor(w.percent), percent: w.percent }))
    .filter((p): p is { x: number; y: number; percent: number } => p !== null);

  // Break the trend line into contiguous runs across "no data" gaps rather
  // than drawing one path that jumps over them.
  const linePath = weeks
    .reduce<{ x: number; y: number }[][]>((runs, w, i) => {
      if (w.percent === null) {
        runs.push([]);
        return runs;
      }
      const last = runs[runs.length - 1];
      if (!last) runs.push([{ x: xFor(i), y: yFor(w.percent) }]);
      else last.push({ x: xFor(i), y: yFor(w.percent) });
      return runs;
    }, [[]])
    .filter((run) => run.length > 0);

  return (
    <div className="flex flex-1 flex-col items-center px-6 py-12 font-sans sm:py-16">
      <div className="flex w-full max-w-2xl flex-col gap-6">
        <div className="flex items-center justify-between">
          <div>
            <Link
              href="/dashboard"
              className="text-xs font-medium uppercase tracking-widest text-zinc-500 transition hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
            >
              ← Dashboard
            </Link>
            <h1 className="mt-1 text-2xl font-semibold text-black dark:text-zinc-50">
              {role} — 6-week trend
            </h1>
          </div>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        {load === "ready" && weeks.length === 0 && (
          <p className="rounded-xl border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
            No history yet for {role}. Once a week&rsquo;s plan is confirmed,
            it shows up here.
          </p>
        )}

        {weeks.length > 0 && (
          <div className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
            <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`${role} completion percentage for the last ${weeks.length} weeks`}>
              {[0, 25, 50, 75, 100].map((tick) => (
                <g key={tick}>
                  <line
                    x1={padL}
                    x2={W - padR}
                    y1={yFor(tick)}
                    y2={yFor(tick)}
                    className="stroke-zinc-100 dark:stroke-zinc-800"
                    strokeWidth={1}
                  />
                  <text
                    x={padL - 8}
                    y={yFor(tick) + 3}
                    textAnchor="end"
                    fontSize={9.5}
                    className="fill-zinc-400 dark:fill-zinc-500"
                  >
                    {tick}%
                  </text>
                </g>
              ))}

              {weeks.map((w, i) => {
                const isCurrent = w.weekStart === currentWeekStart;
                const x = xFor(i) - barW / 2;
                if (w.percent === null) {
                  return (
                    <g key={w.weekStart}>
                      <rect
                        x={x}
                        y={padT}
                        width={barW}
                        height={plotH}
                        rx={4}
                        fill="none"
                        strokeDasharray="3,3"
                        className="stroke-zinc-300 dark:stroke-zinc-700"
                        strokeWidth={1.5}
                      />
                      <text
                        x={xFor(i)}
                        y={padT + plotH / 2 + 3}
                        textAnchor="middle"
                        fontSize={9}
                        className="fill-zinc-400 dark:fill-zinc-500"
                      >
                        no data
                      </text>
                    </g>
                  );
                }
                const barY = yFor(w.percent);
                return (
                  <rect
                    key={w.weekStart}
                    x={x}
                    y={barY}
                    width={barW}
                    height={padT + plotH - barY}
                    rx={4}
                    className={
                      isCurrent
                        ? "fill-emerald-400 stroke-emerald-600 dark:fill-emerald-400/80 dark:stroke-emerald-300"
                        : "fill-emerald-500/70 stroke-none dark:fill-emerald-500/60"
                    }
                    strokeWidth={isCurrent ? 1.5 : 0}
                  />
                );
              })}

              {linePath.map((run, i) =>
                run.length > 1 ? (
                  <polyline
                    key={i}
                    points={run.map((p) => `${p.x},${p.y}`).join(" ")}
                    fill="none"
                    className="stroke-zinc-800 dark:stroke-zinc-200"
                    strokeWidth={1.75}
                  />
                ) : null,
              )}
              {dataPoints.map((p, i) => (
                <circle key={i} cx={p.x} cy={p.y} r={3.5} className="fill-zinc-800 dark:fill-zinc-100" />
              ))}

              {weeks.map((w, i) => (
                <text
                  key={w.weekStart}
                  x={xFor(i)}
                  y={H - 10}
                  textAnchor="middle"
                  fontSize={10}
                  className={
                    w.weekStart === currentWeekStart
                      ? "fill-emerald-600 font-semibold dark:fill-emerald-400"
                      : "fill-zinc-500 dark:fill-zinc-400"
                  }
                >
                  {formatWeekLabel(w.weekStart)}
                  {w.weekStart === currentWeekStart ? " •" : ""}
                </text>
              ))}
            </svg>

            <ul className="mt-4 flex flex-wrap gap-x-6 gap-y-1 border-t border-zinc-100 pt-3 text-xs text-zinc-500 dark:border-zinc-900 dark:text-zinc-400">
              {weeks.map((w) => (
                <li key={w.weekStart}>
                  <span className="font-medium text-zinc-700 dark:text-zinc-200">
                    {formatWeekLabel(w.weekStart)}
                  </span>{" "}
                  {w.percent === null ? "no data" : `${w.numerator}/${w.denominator} · ${w.percent}%`}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
