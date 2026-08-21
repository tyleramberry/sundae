"use client";

import { useEffect, useRef } from "react";
import type { ClassifiedAction } from "@/lib/engine/weeklySessionTypes";
import { weekdayFromText } from "@/lib/planning/blocks";

// The live audit-trail panel for the weekly planning session (right side of
// the chat split). Renders every role from onboarding_answers as a header,
// with the engine's actionsSoFar grouped underneath -- fills in turn by
// turn as the model classifies each new item, so the user can see exactly
// what the model is thinking before it ever touches the calendar.
//
// Deliberately purely presentational: takes the exact `actionsSoFar` array
// the engine already returns on every turn (see weeklySessionTypes.ts's
// "grows turn-by-turn as action items get classified" note) and the fixed
// role list from onboarding, and renders. Nothing about the model's output
// is invented here -- a "Habit, 7×, Saturday" chip is only ever showing
// what the engine's classification actually said.
//
// Live-vs-batch note: cadence and (if the user named a day) weekday are
// available live during the chat. Exact time-of-day only appears once
// /propose runs (batch slotting needs every role's items at once), which is
// why the parent swaps this panel for WeekCalendarGrid at that point --
// this panel deliberately never fakes a time.

const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

function typeBadgeClasses(type: ClassifiedAction["type"]): string {
  // Semantic color per action type -- accent for the recurring one, neutral
  // for the one-off, muted for the no-calendar-time one, mirroring how
  // Sundae's other surfaces (dashboard rings, follow-ups slider) treat the
  // same three concepts.
  switch (type) {
    case "habit":
      return "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300";
    case "goal":
      return "bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300";
    case "project":
      return "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300";
  }
}

function cadenceLabel(action: ClassifiedAction): string | null {
  if (action.type !== "habit") return null;
  const n = action.cadenceCount ?? 1;
  if (n === 7) return "every day";
  return `${n}× this week`;
}

// "14:00" -> "2:00 PM", local-time display of the drilled-down clock time
// the Stage 3 time question captured -- shown so the user can see Sundae
// actually picked up the specific time, not just the day, while the chat
// is still going. Falls back to null (chip hidden) for anything malformed.
function timeLabel(action: ClassifiedAction): string | null {
  if (!action.preferredTime) return null;
  const match = /^([0-1]?\d|2[0-3]):([0-5]\d)$/.exec(action.preferredTime.trim());
  if (!match) return null;
  const d = new Date();
  d.setHours(Number(match[1]), Number(match[2]), 0, 0);
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

// "60" -> "1 hr", "90" -> "1.5 hr", "30" -> "30 min". Displayed so the
// user can see Sundae actually captured the length they asked for instead
// of silently falling back to the batch default.
function durationLabel(action: ClassifiedAction): string | null {
  if (!action.durationMinutes || action.durationMinutes <= 0) return null;
  const m = action.durationMinutes;
  if (m < 60) return `${m} min`;
  const hrs = m / 60;
  return `${Number.isInteger(hrs) ? hrs : hrs.toFixed(1)} hr`;
}

export default function WeeklyPlanPanel({
  roles,
  actionsSoFar,
  weekConfirmed = false,
  onRetryCalendar,
  onRedoCalendar,
  retryingCalendar = false,
}: {
  roles: string[];
  actionsSoFar: ClassifiedAction[];
  weekConfirmed?: boolean;
  // Bug-fix recovery actions (see /api/weekly-session/retry-calendar):
  // shown once the week is confirmed so a user whose items got saved to
  // the plan without a real Google Calendar time (the all-day-event bug)
  // has a way to fix it from the app itself, not just a one-off script.
  // Optional -- omitted entirely outside the "chatting" stage where this
  // panel and a confirmed week can both be true at once.
  onRetryCalendar?: () => void;
  // "Redo" (route's `redo: true`) deletes and rewrites EVERY event this
  // week, not just missing ones -- the escape hatch for a week that
  // already got real-but-wrong events written by an earlier, buggier
  // version of this same recovery flow (see the route's file header).
  // Confirmed in-component before firing since it's destructive.
  onRedoCalendar?: () => void;
  retryingCalendar?: boolean;
}) {
  // Group by the exact role order onboarding_answers.roles supplied -- the
  // same order the session runs through -- so the visual reads top-to-
  // bottom in the order the conversation itself does.
  const byRole = new Map<string, ClassifiedAction[]>();
  for (const role of roles) byRole.set(role, []);
  for (const action of actionsSoFar) {
    // If the engine ever produces a role name not in the fixed list, still
    // render it rather than dropping it silently -- unexpected data is a
    // hint the engine drifted, and hiding it would hide that.
    const list = byRole.get(action.role) ?? [];
    list.push(action);
    byRole.set(action.role, list);
  }

  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [actionsSoFar]);

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-4">
      <div>
        <p className="text-xs font-medium uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
          Plan so far
        </p>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          What Sundae is picking up as you talk
          {weekConfirmed
            ? " — this week's plan stays here after you confirm."
            : ". Nothing here is on your calendar until you confirm."}
        </p>
        {weekConfirmed && onRetryCalendar && (
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              onClick={onRetryCalendar}
              disabled={retryingCalendar}
              className="rounded-full border border-zinc-300 px-3 py-1.5 text-xs text-zinc-700 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300"
            >
              {retryingCalendar ? "Checking your calendar…" : "Fix missing calendar times"}
            </button>
            {onRedoCalendar && (
              <button
                onClick={() => {
                  // Deletes and rewrites every event this week -- confirm
                  // before touching the real calendar, since unlike "fix
                  // missing" this one does overwrite things that already
                  // exist.
                  if (
                    window.confirm(
                      "This deletes and re-creates every calendar event for this week's plan, at the correct times. Continue?",
                    )
                  ) {
                    onRedoCalendar();
                  }
                }}
                disabled={retryingCalendar}
                className="rounded-full border border-zinc-300 px-3 py-1.5 text-xs text-zinc-700 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300"
              >
                {retryingCalendar ? "Working…" : "Redo all calendar times"}
              </button>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3">
        {[...byRole.entries()].map(([role, items]) => (
          <section
            key={role}
            className="rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950"
          >
            <h3 className="text-sm font-semibold text-black dark:text-zinc-50">
              {role}
            </h3>

            {items.length === 0 ? (
              <p className="mt-2 text-xs text-zinc-400 dark:text-zinc-500">
                {weekConfirmed ? "Nothing planned for this role." : "Waiting for this role…"}
              </p>
            ) : (
              <ul className="mt-2 flex flex-col gap-2">
                {items.map((action, i) => {
                  // Structured field first -- the live engine captures the
                  // day this way now (see ClassifiedAction.weekday); the
                  // text-parse fallback only still matters for items
                  // classified before that field existed.
                  const dayIdx = action.weekday ?? weekdayFromText(action.description);
                  const cadence = cadenceLabel(action);
                  const time = timeLabel(action);
                  const duration = durationLabel(action);
                  return (
                    <li
                      key={`${role}-${i}`}
                      className="flex flex-col gap-1 rounded-lg bg-zinc-50 p-2 dark:bg-zinc-900"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-sm text-zinc-800 dark:text-zinc-100">
                          {action.description}
                        </span>
                        <span
                          className={[
                            "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                            typeBadgeClasses(action.type),
                          ].join(" ")}
                        >
                          {action.type}
                        </span>
                      </div>
                      {(cadence || dayIdx !== null || time || duration) && (
                        <div className="flex flex-wrap gap-1.5">
                          {cadence && (
                            <span className="rounded-full bg-zinc-200 px-2 py-0.5 text-[10px] font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                              {cadence}
                            </span>
                          )}
                          {dayIdx !== null && (
                            <span className="rounded-full bg-zinc-200 px-2 py-0.5 text-[10px] font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                              {WEEKDAY_NAMES[dayIdx]}
                            </span>
                          )}
                          {time && (
                            <span className="rounded-full bg-zinc-200 px-2 py-0.5 text-[10px] font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                              {time}
                            </span>
                          )}
                          {duration && (
                            <span className="rounded-full bg-zinc-200 px-2 py-0.5 text-[10px] font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                              {duration}
                            </span>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        ))}
      </div>
      <div ref={endRef} />
    </div>
  );
}
