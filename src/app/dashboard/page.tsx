"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

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

// Current-week KPI dashboard (Day 12, scoped for the Day 7 demo). Read-only:
// one tile per role showing this week's completion, plus the items behind
// it. This is where the weekly-session "done" screen now lands, so the plan
// -> calendar flow has somewhere to go instead of dead-ending.
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
      <div className="flex flex-1 items-center justify-center bg-zinc-50 font-sans dark:bg-black">
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Loading…</p>
      </div>
    );
  }

  const hasAnyItems = roles.some((r) => r.denominator > 0);

  return (
    <div className="flex flex-1 flex-col items-center bg-zinc-50 px-6 py-16 font-sans dark:bg-black">
      <div className="flex w-full max-w-2xl flex-col gap-6">
        <div className="flex items-end justify-between">
          <div>
            <span className="text-sm font-medium uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
              Sundae
            </span>
            <h1 className="mt-1 text-2xl font-semibold text-black dark:text-zinc-50">
              This week
            </h1>
          </div>
          <Link
            href="/weekly-session"
            className="rounded-full bg-black px-4 py-2 text-sm text-white dark:bg-white dark:text-black"
          >
            New weekly session
          </Link>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        {!hasAnyItems && (
          <p className="rounded-lg border border-dashed border-zinc-300 p-6 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
            Nothing planned yet this week. Start a weekly session to fill it in.
          </p>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {roles.map((tile) => (
            <div
              key={tile.role}
              className="flex flex-col gap-3 rounded-xl border border-zinc-200 p-5 dark:border-zinc-800"
            >
              <div className="flex items-baseline justify-between">
                <h2 className="text-base font-semibold text-black dark:text-zinc-50">
                  {tile.role}
                </h2>
                <span className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
                  {tile.numerator}/{tile.denominator}
                  {tile.percent !== null && (
                    <span className="ml-1 text-zinc-400 dark:text-zinc-500">
                      · {tile.percent}%
                    </span>
                  )}
                </span>
              </div>

              {tile.denominator > 0 && (
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                  <div
                    className="h-full rounded-full bg-emerald-500"
                    style={{ width: `${tile.percent ?? 0}%` }}
                  />
                </div>
              )}

              {tile.items.length === 0 ? (
                <p className="text-sm text-zinc-400 dark:text-zinc-500">
                  Nothing planned for this role.
                </p>
              ) : (
                <ul className="flex flex-col gap-1.5">
                  {tile.items.map((item) => {
                    const complete =
                      item.type === "project"
                        ? (item.percent ?? 0) >= 100
                        : item.done;
                    return (
                      <li
                        key={item.id}
                        className="flex items-center justify-between gap-2 text-sm"
                      >
                        <span
                          className={
                            complete
                              ? "text-zinc-400 line-through dark:text-zinc-500"
                              : "text-zinc-700 dark:text-zinc-300"
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
