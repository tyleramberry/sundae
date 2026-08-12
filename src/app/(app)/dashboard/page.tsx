"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import KpiRing from "@/components/KpiRing";

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

// Current-week KPI dashboard (Day 11 redesign). Each role is a filling ring;
// every number on the page is one click from being logged -- clicking an
// item deep-links to /daily-follow-ups with that item highlighted, clicking
// a ring jumps to that role's section there. Read-only itself: all logging
// happens on the follow-ups page, so there's exactly one place "done" is
// written.
export default function DashboardPage() {
  const router = useRouter();
  const [load, setLoad] = useState<Load>("checking");
  const [roles, setRoles] = useState<RoleTile[]>([]);
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
      const res = await fetch("/api/dashboard");
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error ?? "Couldn't load your dashboard.");
        setLoad("error");
        return;
      }
      setRoles(body.roles ?? []);
      setLoad("ready");
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (load === "checking" || load === "signed-out" || load === "loading") {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Loading…</p>
      </div>
    );
  }

  const hasAnyItems = roles.some((r) => r.denominator > 0);

  return (
    <div className="flex flex-1 flex-col items-center px-6 py-12 font-sans sm:py-16">
      <div className="flex w-full max-w-3xl flex-col gap-8">
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

        <div className="grid grid-cols-1 gap-x-6 gap-y-10 sm:grid-cols-2">
          {roles.map((tile) => (
            <div key={tile.role} className="flex flex-col items-center gap-4">
              <Link
                href={`/daily-follow-ups?role=${encodeURIComponent(tile.role)}`}
                className="rounded-full transition hover:opacity-80 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
                aria-label={`Log follow-ups for ${tile.role}`}
              >
                <KpiRing
                  role={tile.role}
                  numerator={tile.numerator}
                  denominator={tile.denominator}
                  percent={tile.percent}
                />
              </Link>

              <Link
                href={`/dashboard/${encodeURIComponent(tile.role)}/trend`}
                className="text-xs font-medium text-zinc-400 underline-offset-2 transition hover:text-emerald-600 hover:underline dark:text-zinc-500 dark:hover:text-emerald-400"
              >
                6-week trend →
              </Link>

              {tile.items.length > 0 && (
                <ul className="flex w-full max-w-xs flex-col gap-1">
                  {tile.items.map((item) => {
                    const complete =
                      item.type === "project"
                        ? (item.percent ?? 0) >= 100
                        : item.done;
                    return (
                      <li key={item.id}>
                        <Link
                          href={`/daily-follow-ups?item=${encodeURIComponent(item.id)}`}
                          className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm transition hover:bg-zinc-100 dark:hover:bg-zinc-900"
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
                          <span className="shrink-0 text-xs uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
                            {item.type === "project"
                              ? `${item.percent ?? 0}%`
                              : complete
                                ? "done"
                                : item.type}
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
