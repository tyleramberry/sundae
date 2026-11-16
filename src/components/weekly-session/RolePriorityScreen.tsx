"use client";

import { useMemo, useRef, useState } from "react";
import KpiRing from "@/components/KpiRing";

// Priority-order confirmation, shown once at the very start of a brand-new
// week's session -- before Stage 1 -- never on a returning-mid-session or
// mid-week-addendum visit (see weekly-session/page.tsx's bootstrap effect,
// which only enters this stage when there's no transcript yet this week).
//
// This is the same drag-to-reorder mechanism the dashboard already ships
// (see dashboard/page.tsx's Day 17 reorder), reused here rather than
// invented fresh, and writing to the exact same endpoint
// (PATCH /api/onboarding/roles) -- so whatever order gets confirmed here
// is the same order the dashboard's rings show and the same order
// weeklySession.ts already runs Stage 2 in (it just reads onboarding.roles
// as given). The only new thing is *when* the user gets asked to set it:
// at the start of planning, not left to drift from a stale dashboard drag
// from weeks ago.
//
// Default display order is suggested, not decided for the user -- sorted
// by last week's completion (least progress first, "no data at all" tied
// for most urgent), echoing PMG's explicit priority ordering while still
// requiring the user's own drag to confirm it, same spirit as Stage 2
// never picking a goal for the user.

function GripIcon() {
  return (
    <svg viewBox="0 0 12 20" width={10} height={16} aria-hidden fill="currentColor">
      {[3, 9, 15].map((cy) =>
        [3, 9].map((cx) => <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={1.4} />),
      )}
    </svg>
  );
}

export type LastWeekRoleStat = {
  role: string;
  numerator: number;
  denominator: number;
  percent: number | null;
};

function suggestedOrder(roles: string[], stats: LastWeekRoleStat[]): string[] {
  const byRole = new Map(stats.map((s) => [s.role, s]));
  // Null (nothing planned at all last week) sorts as most urgent -- tied
  // with 0%, ahead of any real progress. Ties otherwise keep the user's
  // original declared order (Array.prototype.sort is stable).
  return [...roles].sort((a, b) => {
    const pa = byRole.get(a)?.percent;
    const pb = byRole.get(b)?.percent;
    const ka = pa === null || pa === undefined ? -1 : pa;
    const kb = pb === null || pb === undefined ? -1 : pb;
    return ka - kb;
  });
}

export function RolePriorityScreen({
  roles,
  lastWeekStats,
  onConfirm,
}: {
  roles: string[];
  lastWeekStats: LastWeekRoleStat[];
  onConfirm: (orderedRoles: string[]) => void;
}) {
  const initialOrder = useMemo(
    () => suggestedOrder(roles, lastWeekStats),
    // Only ever computed once, from the props this screen mounted with --
    // re-sorting out from under a mid-drag user would be a bad time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const statsByRole = useMemo(() => new Map(lastWeekStats.map((s) => [s.role, s])), [lastWeekStats]);

  const [order, setOrder] = useState<string[]>(initialOrder);
  const [draggedRole, setDraggedRole] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dragStartOrderRef = useRef<string[] | null>(null);

  function handleDragStart(role: string) {
    dragStartOrderRef.current = order;
    setDraggedRole(role);
  }

  function handleDragOver(e: React.DragEvent, overRole: string) {
    e.preventDefault();
    if (!draggedRole || draggedRole === overRole) return;
    setOrder((prev) => {
      const from = prev.indexOf(draggedRole);
      const to = prev.indexOf(overRole);
      if (from === -1 || to === -1 || from === to) return prev;
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }

  function handleDragEnd() {
    setDraggedRole(null);
    dragStartOrderRef.current = null;
  }

  async function handleConfirm() {
    setSaving(true);
    setError(null);
    // Only worth a network round-trip if the drag actually changed
    // anything from what's already saved.
    const changed = order.some((r, i) => r !== roles[i]);
    if (!changed) {
      onConfirm(order);
      return;
    }
    try {
      const res = await fetch("/api/onboarding/roles", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roles: order }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Couldn't save the new order.");
        setSaving(false);
        return;
      }
      onConfirm(order);
    } catch {
      setError("Couldn't save the new order.");
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col items-center bg-zinc-50 px-6 py-16 font-sans dark:bg-black">
      <div className="flex w-full max-w-lg flex-1 flex-col gap-6">
        <div>
          <span className="text-sm font-medium uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
            Sundae
          </span>
          <h1 className="mt-1 text-2xl font-semibold text-black dark:text-zinc-50">
            What needs attention first this week?
          </h1>
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
            Drag to set the order Sundae asks about each role. We&apos;ve started with what
            made the least progress last week, but you know your week better than we do.
          </p>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <ul className="flex flex-col gap-2">
          {order.map((role) => {
            const stat = statsByRole.get(role);
            return (
              <li
                key={role}
                onDragOver={(e) => handleDragOver(e, role)}
                className={[
                  "flex items-center gap-3 rounded-xl border border-zinc-200 bg-white px-4 py-3 transition dark:border-zinc-800 dark:bg-zinc-950",
                  draggedRole === role ? "opacity-40" : "",
                ].join(" ")}
              >
                <span
                  draggable
                  onDragStart={() => handleDragStart(role)}
                  onDragEnd={handleDragEnd}
                  aria-label={`Drag to reorder ${role}`}
                  title="Drag to reorder"
                  className="cursor-grab touch-none rounded p-1 text-zinc-300 transition hover:text-zinc-500 active:cursor-grabbing dark:text-zinc-700 dark:hover:text-zinc-400"
                >
                  <GripIcon />
                </span>
                <div className="shrink-0">
                  <KpiRing
                    role={role}
                    numerator={stat?.numerator ?? 0}
                    denominator={stat?.denominator ?? 0}
                    percent={stat?.percent ?? null}
                    size={56}
                  />
                </div>
                <div className="flex flex-1 flex-col">
                  <span className="text-sm font-medium text-black dark:text-zinc-50">{role}</span>
                  <span className="text-xs text-zinc-400 dark:text-zinc-500">
                    {stat && stat.denominator > 0 ? "last week" : "nothing planned last week"}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>

        <button
          type="button"
          onClick={() => void handleConfirm()}
          disabled={saving}
          className="mt-2 w-full rounded-xl bg-black px-4 py-3 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:opacity-50 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
        >
          {saving ? "Saving…" : "Start this week's planning"}
        </button>
      </div>
    </div>
  );
}
