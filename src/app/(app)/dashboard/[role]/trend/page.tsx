"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import TrendChart, { type WeekPoint } from "@/components/TrendChart";

type Load = "checking" | "loading" | "ready" | "error";

// The 6-week trend view (Day 15). Fetches this role's real weeks from
// /api/dashboard/trend -- the exact same numbers the dashboard tile's live
// percentage comes from, just grouped by week instead of only the current
// one -- and hands them to TrendChart, which owns the actual rendering
// (shared with /debug/trend's hardcoded example data).
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

  return (
    <div className="flex min-h-0 flex-1 flex-col items-center overflow-y-auto px-6 py-12 font-sans sm:py-16">
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

        <TrendChart role={role} weeks={weeks} currentWeekStart={currentWeekStart} />
      </div>
    </div>
  );
}
