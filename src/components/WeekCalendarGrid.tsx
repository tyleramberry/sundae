// Week calendar grid for the weekly-session split view -- Sun-Sat columns,
// hourly rows over the 6am–10pm visible window, with three visual layers:
//   - REAL events (neutral, muted) -- what's already on the user's Google
//     Calendar.
//   - DRAFT blocks (sky-tinted, dashed border, "DRAFT" label) -- items the
//     engine has already classified during the chat but that /propose has
//     not slotted yet. Approximate: they use whatever the classifier
//     already captured (weekday + preferredTime + duration). Exact times
//     come from /propose at session end. Rendered underneath proposed so
//     once a real proposal exists it visually replaces the draft.
//   - PROPOSED blocks (accent, solid) -- what Sundae is suggesting for the
//     plan being reviewed. Deliberately visually distinct so it reads as
//     "not on your calendar yet" even at a glance, matching the confirm-
//     screen copy's "nothing's on your calendar yet."
//
// Layout: the time gutter and each day column are the SAME canvas -- a
// stack of HOUR_ROW_PX slots whose total height is gridBodyHeightPx().
// Events are positioned as % of that day column, so they cannot drift
// off the labels even if a parent flex pane is taller than the grid.
// (A spanning CSS-grid overlay used to size independently of the hour
// rows, which squeezed a full day of events into the 6–9am band.)
//
// Rendered on the right side of /weekly-session throughout the flow. The
// PROPOSED blocks' start/end come from /api/weekly-session/propose, which
// does all the collision-avoidance math -- this component is pure display.

import {
  DAY_LABELS,
  HOUR_ROW_PX,
  draftToPositioned,
  eventToPositioned,
  formatHourLabel,
  gridBodyHeightPx,
  hourSlots,
  proposedToPositioned,
  type CalendarEvent,
  type PositionedItem,
  type ProposedBlock,
} from "@/lib/weeklySession/calendarGrid";

export type { CalendarEvent, ProposedBlock };

export default function WeekCalendarGrid({
  events,
  proposed,
  draft,
  weekStart,
  weekLabel,
}: {
  events: CalendarEvent[];
  proposed: ProposedBlock[];
  // Live-classified draft blocks (see file header). Optional -- omitted
  // outside the "chatting" stage where the plan is still being built.
  draft?: ProposedBlock[];
  weekStart: Date;
  weekLabel?: string;
}) {
  const hours = hourSlots();
  const bodyHeightPx = gridBodyHeightPx();
  const cols = "grid-cols-[56px_repeat(7,1fr)]";

  const realItems = events
    .map((e) => eventToPositioned(e, weekStart))
    .filter((p): p is PositionedItem => p !== null);
  const proposedItems = proposed
    .map((b) => proposedToPositioned(b, weekStart))
    .filter((p): p is PositionedItem => p !== null);
  const draftItems = (draft ?? [])
    .map((b) => draftToPositioned(b, weekStart))
    .filter((p): p is PositionedItem => p !== null);

  const today = new Date();
  const todayIndex =
    today.getTime() >= weekStart.getTime() &&
    today.getTime() < weekStart.getTime() + 7 * 24 * 60 * 60 * 1000
      ? today.getDay()
      : -1;

  const dayHeaders = DAY_LABELS.map((label, i) => {
    const date = new Date(weekStart);
    date.setDate(date.getDate() + i);
    return { label, dayNum: date.getDate(), isToday: i === todayIndex };
  });

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="border-b border-zinc-200 px-4 py-2 dark:border-zinc-800">
        <p className="text-xs font-medium uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
          {weekLabel ?? "This week"}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-3 text-[11px] text-zinc-600 dark:text-zinc-300">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-sm bg-zinc-400 dark:bg-zinc-500" />
            Already on Google Calendar
          </span>
          {draftItems.length > 0 && (
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-sm border-2 border-dashed border-sky-500 bg-sky-100 dark:border-sky-400 dark:bg-sky-200" />
              Draft — being built as you plan
            </span>
          )}
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-sm border-2 border-emerald-600 bg-emerald-400 dark:border-emerald-400 dark:bg-emerald-600" />
            Sundae proposal (not written yet)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-sm border-2 border-amber-600 bg-amber-300 dark:border-amber-400 dark:bg-amber-600" />
            Overlaps something real — asks before writing
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <div className="min-w-[560px] text-[11px]">
          <div
            className={`sticky top-0 z-10 grid ${cols} bg-white dark:bg-zinc-950`}
          >
            <div />
            {dayHeaders.map((h, i) => (
              <div
                key={i}
                className={[
                  "flex flex-col items-center justify-center border-b border-l border-zinc-200 py-1.5 dark:border-zinc-800",
                  h.isToday
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-zinc-500 dark:text-zinc-400",
                ].join(" ")}
              >
                <span className="text-[10px] font-medium uppercase tracking-wide">
                  {h.label}
                </span>
                <span className={h.isToday ? "text-sm font-semibold" : "text-sm"}>
                  {h.dayNum}
                </span>
              </div>
            ))}
          </div>

          <div
            className={`grid ${cols}`}
            style={{
              height: `${bodyHeightPx}px`,
              alignContent: "start",
            }}
          >
            <div className="flex flex-col" style={{ height: `${bodyHeightPx}px` }}>
              {hours.map((h) => (
                <div
                  key={`h-${h}`}
                  className="flex shrink-0 items-start justify-end border-t border-zinc-100 pr-2 pt-0.5 text-[10px] font-medium tabular-nums text-zinc-500 dark:border-zinc-900 dark:text-zinc-500"
                  style={{ height: `${HOUR_ROW_PX}px` }}
                >
                  {formatHourLabel(h)}
                </div>
              ))}
            </div>

            {DAY_LABELS.map((_, dayIdx) => {
              const dayReal = realItems.filter((i) => i.dayIndex === dayIdx);
              const dayDraft = draftItems.filter((i) => i.dayIndex === dayIdx);
              const dayProposed = proposedItems.filter((i) => i.dayIndex === dayIdx);
              return (
                <div
                  key={`day-${dayIdx}`}
                  className="relative border-l border-zinc-100 dark:border-zinc-900"
                  style={{ height: `${bodyHeightPx}px` }}
                >
                  {hours.map((h) => (
                    <div
                      key={`line-${h}`}
                      className="pointer-events-none border-t border-zinc-100 dark:border-zinc-900"
                      style={{ height: `${HOUR_ROW_PX}px` }}
                    />
                  ))}
                  {dayReal.map((item) => (
                    <div
                      key={item.key}
                      className="pointer-events-auto absolute inset-x-0.5 overflow-hidden rounded-sm border border-zinc-400 bg-zinc-300 px-1 text-[9px] leading-tight text-zinc-800 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-100"
                      style={{
                        top: `${item.topPercent}%`,
                        height: `${item.heightPercent}%`,
                      }}
                      title={`Already on calendar: ${item.label}`}
                    >
                      <span className="line-clamp-2">
                        <span className="font-semibold uppercase tracking-wide text-[8px] text-zinc-600 dark:text-zinc-300">
                          Busy ·{" "}
                        </span>
                        {item.label}
                      </span>
                    </div>
                  ))}
                  {dayDraft.map((item) => (
                    <div
                      key={item.key}
                      className="pointer-events-auto absolute inset-x-0.5 z-[1] overflow-hidden rounded-sm border-2 border-dashed border-sky-500 bg-sky-100 px-1 text-[9px] leading-tight text-sky-900 dark:border-sky-400 dark:bg-sky-200 dark:text-sky-900"
                      style={{
                        top: `${item.topPercent}%`,
                        height: `${item.heightPercent}%`,
                      }}
                      title={`Draft (not yet slotted): ${item.role ? `${item.role} · ` : ""}${item.label}`}
                    >
                      <span className="line-clamp-2 font-semibold">
                        <span className="text-[8px] uppercase tracking-wide opacity-80">
                          Draft ·{" "}
                        </span>
                        {item.label}
                      </span>
                      {item.role && (
                        <span className="block truncate text-[8px] uppercase tracking-wide opacity-70">
                          {item.role}
                        </span>
                      )}
                    </div>
                  ))}
                  {dayProposed.map((item) => (
                    <div
                      key={item.key}
                      className={[
                        "pointer-events-auto absolute inset-x-0.5 z-[2] overflow-hidden rounded-sm border-2 px-1 text-[9px] leading-tight",
                        item.conflictsWith
                          ? "border-amber-600 bg-amber-300 text-amber-950 dark:border-amber-400 dark:bg-amber-600 dark:text-amber-50"
                          : "border-emerald-600 bg-emerald-400 text-emerald-950 dark:border-emerald-300 dark:bg-emerald-600 dark:text-emerald-50",
                      ].join(" ")}
                      style={{
                        top: `${item.topPercent}%`,
                        height: `${item.heightPercent}%`,
                      }}
                      title={
                        item.conflictsWith
                          ? `Overlaps: ${item.conflictsWith} — ${item.role ? `${item.role} · ` : ""}${item.label}`
                          : `Sundae proposal: ${item.role ? `${item.role} · ` : ""}${item.label}`
                      }
                    >
                      <span className="line-clamp-2 font-semibold">
                        <span className="text-[8px] uppercase tracking-wide">
                          {item.conflictsWith ? "Overlaps · " : "Sundae · "}
                        </span>
                        {item.label}
                      </span>
                      {item.role && (
                        <span className="block truncate text-[8px] uppercase tracking-wide opacity-70">
                          {item.role}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
