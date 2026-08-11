"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

type Item = {
  id: string;
  role: string;
  title: string;
  type: "habit" | "goal" | "project";
  done: boolean;
  percent: number | null;
};

type RoleGroup = { role: string; items: Item[] };
type Load = "checking" | "loading" | "ready" | "error";

// Daily follow-ups (Day 11 UI pass) -- the in-app logging surface the daily
// nudge email finally has somewhere to point at. This is the ONLY place a
// KPI numerator moves: check off a habit/goal, drag a project's slider.
// Reads the same /api/dashboard payload the dashboard rings read, so the two
// can never disagree about this week's items. Deep links from the dashboard
// arrive as ?item=<id> (scroll + highlight a single item) or ?role=<name>
// (scroll to a role section).
function DailyFollowUpsInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const focusItem = searchParams.get("item");
  const focusRole = searchParams.get("role");

  const [load, setLoad] = useState<Load>("checking");
  const [items, setItems] = useState<Item[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<Set<string>>(new Set());

  const itemRefs = useRef<Map<string, HTMLLIElement>>(new Map());
  const roleRefs = useRef<Map<string, HTMLElement>>(new Map());

  useEffect(() => {
    void (async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.replace("/login?next=/daily-follow-ups");
        return;
      }
      setLoad("loading");
      const res = await fetch("/api/dashboard");
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error ?? "Couldn't load this week's items.");
        setLoad("error");
        return;
      }
      type Tile = { role: string; items: Omit<Item, "role">[] };
      const flat: Item[] = ((body.roles ?? []) as Tile[]).flatMap((tile) =>
        tile.items.map((i) => ({ ...i, role: tile.role })),
      );
      setItems(flat);
      setLoad("ready");
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Scroll the deep-linked target into view once the data is on screen.
  useEffect(() => {
    if (load !== "ready") return;
    const el = focusItem
      ? itemRefs.current.get(focusItem)
      : focusRole
        ? roleRefs.current.get(focusRole)
        : null;
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [load, focusItem, focusRole]);

  const groups = useMemo<RoleGroup[]>(() => {
    const map = new Map<string, Item[]>();
    for (const it of items) {
      const list = map.get(it.role) ?? [];
      list.push(it);
      map.set(it.role, list);
    }
    return [...map.entries()].map(([role, list]) => ({ role, items: list }));
  }, [items]);

  const commit = useCallback(
    async (id: string, patch: { done?: boolean; percent?: number }) => {
      setSaving((s) => new Set(s).add(id));
      try {
        const res = await fetch("/api/weekly-items/log", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, ...patch }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          setError(body.error ?? "Couldn't save that change.");
        } else {
          setError(null);
        }
      } finally {
        setSaving((s) => {
          const next = new Set(s);
          next.delete(id);
          return next;
        });
      }
    },
    [],
  );

  function toggleDone(item: Item) {
    const next = !item.done;
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, done: next } : i)));
    void commit(item.id, { done: next });
  }

  function setPercentLocal(id: string, percent: number) {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, percent } : i)));
  }

  if (load === "checking" || load === "loading") {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Loading…</p>
      </div>
    );
  }

  const hasItems = items.length > 0;

  return (
    <div className="flex flex-1 flex-col items-center px-6 py-12 font-sans sm:py-16">
      <div className="flex w-full max-w-2xl flex-col gap-8">
        <header className="flex flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
            Sundae
          </span>
          <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">
            Daily follow-ups
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Check off what you got done this week. Every change updates your
            role KPIs on the dashboard right away.
          </p>
        </header>

        {error && (
          <p className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-600 dark:bg-red-950/40 dark:text-red-400">
            {error}
          </p>
        )}

        {!hasItems && (
          <div className="rounded-xl border border-dashed border-zinc-300 p-8 text-center dark:border-zinc-700">
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Nothing planned yet this week.
            </p>
            <Link
              href="/weekly-session"
              className="mt-3 inline-block rounded-full bg-black px-4 py-2 text-sm text-white dark:bg-white dark:text-black"
            >
              Start a weekly session
            </Link>
          </div>
        )}

        {groups.map((group) => (
          <section
            key={group.role}
            ref={(el) => {
              if (el) roleRefs.current.set(group.role, el);
            }}
            className="flex flex-col gap-2"
          >
            <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              {group.role}
            </h2>
            <ul className="flex flex-col gap-2">
              {group.items.map((item) => {
                const highlighted = item.id === focusItem;
                const busy = saving.has(item.id);
                return (
                  <li
                    key={item.id}
                    ref={(el) => {
                      if (el) itemRefs.current.set(item.id, el);
                    }}
                    className={[
                      "rounded-xl border p-4 transition",
                      highlighted
                        ? "border-emerald-400 bg-emerald-50/60 ring-2 ring-emerald-300 dark:border-emerald-500 dark:bg-emerald-950/30 dark:ring-emerald-700"
                        : "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950",
                    ].join(" ")}
                  >
                    {item.type === "project" ? (
                      <div className="flex flex-col gap-3">
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-sm font-medium text-zinc-800 dark:text-zinc-100">
                            {item.title}
                          </span>
                          <span className="shrink-0 text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                            {item.percent ?? 0}%
                          </span>
                        </div>
                        <input
                          type="range"
                          min={0}
                          max={100}
                          step={5}
                          value={item.percent ?? 0}
                          disabled={busy}
                          onChange={(e) => setPercentLocal(item.id, Number(e.target.value))}
                          onPointerUp={(e) =>
                            void commit(item.id, { percent: Number(e.currentTarget.value) })
                          }
                          onKeyUp={(e) =>
                            void commit(item.id, { percent: Number(e.currentTarget.value) })
                          }
                          className="w-full accent-emerald-500"
                          aria-label={`Progress on ${item.title}`}
                        />
                        <span className="text-xs uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
                          Project · counts once it hits 100%
                        </span>
                      </div>
                    ) : (
                      <button
                        onClick={() => toggleDone(item)}
                        disabled={busy}
                        className="flex w-full items-center gap-3 text-left"
                        aria-pressed={item.done}
                      >
                        <span
                          className={[
                            "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition",
                            item.done
                              ? "border-emerald-500 bg-emerald-500 text-white"
                              : "border-zinc-300 dark:border-zinc-600",
                          ].join(" ")}
                        >
                          {item.done && (
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
                              <path d="M5 12.5l4 4L19 7" />
                            </svg>
                          )}
                        </span>
                        <span className="flex flex-1 flex-col">
                          <span
                            className={
                              item.done
                                ? "text-sm text-zinc-400 line-through dark:text-zinc-500"
                                : "text-sm font-medium text-zinc-800 dark:text-zinc-100"
                            }
                          >
                            {item.title}
                          </span>
                          <span className="text-xs uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
                            {item.type}
                          </span>
                        </span>
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}

export default function DailyFollowUpsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-1 items-center justify-center">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Loading…</p>
        </div>
      }
    >
      <DailyFollowUpsInner />
    </Suspense>
  );
}
