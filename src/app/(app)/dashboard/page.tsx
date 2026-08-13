"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import KpiRing from "@/components/KpiRing";
import DashboardStats, { type DashboardSummary } from "@/components/DashboardStats";
import TypeBreakdown, { type TypeBreakdownRow } from "@/components/TypeBreakdown";
import { isItemComplete } from "@/lib/kpi/compute";

type DashItem = {
  id: string;
  title: string;
  type: "habit" | "goal" | "project";
  done: boolean;
  percent: number | null;
};

type RoleTile = {
  role: string;
  numerator: number;
  denominator: number;
  percent: number | null;
  items: DashItem[];
};

type Load = "checking" | "signed-out" | "loading" | "ready" | "error";

// Current-week KPI dashboard (Day 16 all-rings-at-once redesign). Every
// role's ring is visible at once with nothing underneath it -- what's
// planned for a role is tucked behind a hover on that role's title instead
// of being permanently on-page, so the grid stays a single glance instead
// of a scroll. Clicking a ring (or the number inside it) jumps straight to
// that role's 6-week trend; logging itself now lives only on
// /daily-follow-ups (reachable from the sidebar), so this page stays fully
// read-only.
export default function DashboardPage() {
  const router = useRouter();
  const [load, setLoad] = useState<Load>("checking");
  const [roles, setRoles] = useState<RoleTile[]>([]);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setLoad("signed-out");
        router.replace("/login?next=/dashboard");
        return;
      }

      setLoad("loading");
      // Fired together -- the account-wide stat row isn't on the critical
      // path for the rings, so a slow /summary shouldn't hold up the rest
      // of the page. It just fills in its "–" placeholders when it lands.
      const [res, summaryRes] = await Promise.all([
        fetch("/api/dashboard"),
        fetch("/api/dashboard/summary"),
      ]);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error ?? "Couldn't load your dashboard.");
        setLoad("error");
        return;
      }
      setRoles(body.roles ?? []);
      setLoad("ready");

      const summaryBody = await summaryRes.json().catch(() => null);
      if (summaryRes.ok && summaryBody) setSummary(summaryBody);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Both computed straight from the same roles/items /api/dashboard already
  // returned -- no reason to round-trip for numbers already on the page.
  const roleInsight = useMemo(() => {
    const ranked = roles.filter((r) => r.denominator > 0 && r.percent !== null);
    if (ranked.length < 2) return null;
    const strongest = ranked.reduce((a, b) => (b.percent! > a.percent! ? b : a));
    const weakest = ranked.reduce((a, b) => (b.percent! < a.percent! ? b : a));
    if (strongest.role === weakest.role || strongest.percent === weakest.percent) {
      return `All roles even at ${strongest.percent}% this week.`;
    }
    return `Strongest this week: ${strongest.role} (${strongest.percent}%) · Needs attention: ${weakest.role} (${weakest.percent}%)`;
  }, [roles]);

  const typeBreakdown = useMemo<TypeBreakdownRow[]>(() => {
    const totals: Record<string, { total: number; done: number }> = {
      habit: { total: 0, done: 0 },
      goal: { total: 0, done: 0 },
      project: { total: 0, done: 0 },
    };
    for (const tile of roles) {
      for (const item of tile.items) {
        totals[item.type].total += 1;
        if (isItemComplete(item)) totals[item.type].done += 1;
      }
    }
    return (["habit", "goal", "project"] as const).map((type) => ({
      type,
      ...totals[type],
    }));
  }, [roles]);

  if (load === "checking" || load === "signed-out" || load === "loading") {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Loading…</p>
      </div>
    );
  }

  const hasAnyItems = roles.some((r) => r.denominator > 0);

  return (
    <div className="flex min-h-0 flex-1 flex-col items-center overflow-y-auto px-6 py-12 font-sans sm:py-16">
      <div className="flex w-full max-w-5xl flex-col gap-8">
        <div className="flex items-end justify-between">
          <div>
            <span className="text-xs font-medium uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
              Sundae
            </span>
            <h1 className="mt-1 text-2xl font-semibold text-black dark:text-zinc-50">
              This week
            </h1>
          </div>
          <Link
            href="/weekly-session"
            className="rounded-full bg-black px-4 py-2 text-sm text-white transition hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
          >
            New weekly session
          </Link>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        {roles.length === 0 && (
          <p className="rounded-xl border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
            No roles yet. Start a weekly session to set them up.
          </p>
        )}

        {roles.length > 0 && !hasAnyItems && (
          <p className="rounded-xl border border-dashed border-zinc-300 p-6 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
            Nothing planned yet this week. Start a weekly session to fill it in.
          </p>
        )}

        {/* auto-fit rather than fixed breakpoints -- however many roles a
            user has, the tiles fill the row and wrap only when they truly
            no longer fit, which is what keeps every ring on-screen at once
            instead of needing a scroll. */}
        <div className="grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-x-4 gap-y-8">
          {roles.map((tile) => {
            const trendHref = `/dashboard/${encodeURIComponent(tile.role)}/trend`;
            return (
              <div key={tile.role} className="flex flex-col items-center gap-2">
                {/* Hover target: the role title itself. Nothing renders
                    underneath the ring anymore -- this popover is the only
                    place this week's items still show, on demand. */}
                <div className="group/role relative">
                  <span className="line-clamp-1 max-w-[10rem] cursor-default select-none text-center text-sm font-semibold text-black dark:text-zinc-50">
                    {tile.role}
                  </span>
                  <div className="pointer-events-none absolute left-1/2 top-full z-20 w-60 -translate-x-1/2 pt-2 opacity-0 transition duration-150 group-hover/role:pointer-events-auto group-hover/role:opacity-100">
                    <div className="rounded-xl border border-zinc-200 bg-white p-3 text-left shadow-lg dark:border-zinc-800 dark:bg-zinc-900">
                      {tile.items.length === 0 ? (
                        <p className="text-xs text-zinc-400 dark:text-zinc-500">
                          Nothing planned this week.
                        </p>
                      ) : (
                        <ul className="flex flex-col gap-1">
                          {tile.items.map((item) => {
                            const complete =
                              item.type === "project"
                                ? (item.percent ?? 0) >= 100
                                : item.done;
                            return (
                              <li
                                key={item.id}
                                className="flex items-center justify-between gap-2 text-xs"
                              >
                                <span
                                  className={
                                    complete
                                      ? "truncate text-zinc-400 line-through dark:text-zinc-500"
                                      : "truncate text-zinc-700 dark:text-zinc-300"
                                  }
                                >
                                  {item.title}
                                </span>
                                <span className="shrink-0 text-[10px] uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
                                  {item.type === "project"
                                    ? `${item.percent ?? 0}%`
                                    : complete
                                      ? "done"
                                      : item.type}
                                </span>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>
                  </div>
                </div>

                {/* Click the ring (or the number inside it) -> 6-week
                    trend. group/ring is the hover scope KpiRing's fill
                    animation replays on -- see globals.css's ring-fill
                    keyframe. */}
                <Link
                  href={trendHref}
                  className="group/ring rounded-full transition hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
                  aria-label={`View ${tile.role}'s 6-week trend`}
                >
                  <KpiRing
                    role={tile.role}
                    numerator={tile.numerator}
                    denominator={tile.denominator}
                    percent={tile.percent}
                  />
                </Link>
              </div>
            );
          })}
        </div>

        <DashboardStats summary={summary} />

        {roleInsight && (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">{roleInsight}</p>
        )}

        <TypeBreakdown rows={typeBreakdown} />
      </div>
    </div>
  );
}
