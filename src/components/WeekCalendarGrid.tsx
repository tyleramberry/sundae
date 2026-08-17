// Week calendar grid for the weekly-session split view -- Sun-Sat columns,
// hourly rows over blocks.ts's default working-hours window (8am-8pm), with
// two visual layers rendered on top:
//   - REAL events (neutral, muted) -- what's already on the user's Google
//     Calendar.
//   - PROPOSED blocks (accent, dashed border) -- what Sundae is suggesting
//     for the plan being reviewed. Deliberately visually distinct so it
//     reads as "not on your calendar yet" even at a glance, matching the
//     confirm-screen copy's "nothing's on your calendar yet."
//
// Rendered on the right side of /weekly-session once the conversation
// completes and /propose has slotted blocks against real free time. The
// blocks' start/end come from /api/weekly-session/propose, which does all
// the collision-avoidance math already -- this component is pure display.

const HOURS_START = 6;
const HOURS_END = 22;
const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export type CalendarEvent = {
  id?: string;
  summary?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  status?: string;
};

export type ProposedBlock = {
  role: string;
  description: string;
  start: string; // ISO
  end: string;
  // Set when this exact slot overlaps something already on the calendar
  // (see src/lib/planning/blocks.ts's placement redesign) -- the block is
  // never silently moved for this, only flagged so the user can decide.
  conflictsWith?: string;
};

type PositionedItem = {
  key: string;
  label: string;
  role?: string;
  dayIndex: number; // 0=Sun..6=Sat
  topPercent: number;
  heightPercent: number;
  kind: "real" | "proposed";
  conflictsWith?: string;
};

// Turn a raw Google Calendar event into the grid coordinates -- returns
// null for anything that falls outside the visible window (all-day events,
// events fully before 8am or after 8pm, cancelled events).
function eventToPositioned(event: CalendarEvent, weekStart: Date): PositionedItem | null {
  if (event.status === "cancelled") return null;
  const startRaw = event.start?.dateTime;
  const endRaw = event.end?.dateTime;
  // All-day events (only .date, no .dateTime) get skipped -- they don't fit
  // an hourly grid, and rendering them as full-day slabs would obscure
  // Sundae's proposed blocks. A later pass could add an all-day strip
  // above the grid; not today.
  if (!startRaw || !endRaw) return null;
  const start = new Date(startRaw);
  const end = new Date(endRaw);
  return positionOnGrid({
    key: event.id ?? `${startRaw}-${endRaw}`,
    label: event.summary ?? "(no title)",
    start,
    end,
    weekStart,
    kind: "real",
  });
}

function proposedToPositioned(block: ProposedBlock, weekStart: Date): PositionedItem | null {
  const positioned = positionOnGrid({
    key: `proposed-${block.start}-${block.role}-${block.description}`,
    label: block.description,
    role: block.role,
    start: new Date(block.start),
    end: new Date(block.end),
    weekStart,
    kind: "proposed",
  });
  return positioned && block.conflictsWith ? { ...positioned, conflictsWith: block.conflictsWith } : positioned;
}

function positionOnGrid({
  key,
  label,
  role,
  start,
  end,
  weekStart,
  kind,
}: {
  key: string;
  label: string;
  role?: string;
  start: Date;
  end: Date;
  weekStart: Date;
  kind: "real" | "proposed";
}): PositionedItem | null {
  // Which day column, in local time.
  const dayIndex = Math.floor((start.getTime() - weekStart.getTime()) / (24 * 60 * 60 * 1000));
  if (dayIndex < 0 || dayIndex > 6) return null;

  const startMinutes = start.getHours() * 60 + start.getMinutes();
  const endMinutes = end.getHours() * 60 + end.getMinutes();
  const windowStart = HOURS_START * 60;
  const windowEnd = HOURS_END * 60;
  const totalMinutes = windowEnd - windowStart;

  // Clip to the visible window rather than dropping; a 7am-9am event should
  // still render, just clipped to the top of the grid.
  const visibleStart = Math.max(startMinutes, windowStart);
  const visibleEnd = Math.min(endMinutes, windowEnd);
  if (visibleEnd <= visibleStart) return null;

  return {
    key,
    label,
    role,
    dayIndex,
    topPercent: ((visibleStart - windowStart) / totalMinutes) * 100,
    heightPercent: ((visibleEnd - visibleStart) / totalMinutes) * 100,
    kind,
  };
}

export default function WeekCalendarGrid({
  events,
  proposed,
  weekStart,
  weekLabel,
}: {
  events: CalendarEvent[];
  proposed: ProposedBlock[];
  weekStart: Date;
  weekLabel?: string;
}) {
  const hours: number[] = [];
  for (let h = HOURS_START; h < HOURS_END; h++) hours.push(h);

  const realItems = events
    .map((e) => eventToPositioned(e, weekStart))
    .filter((p): p is PositionedItem => p !== null);
  const proposedItems = proposed
    .map((b) => proposedToPositioned(b, weekStart))
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
        <div className="grid min-w-[560px] grid-cols-[40px_repeat(7,1fr)] text-[11px]">
          {/* Day header row */}
          <div className="sticky top-0 z-10 bg-white dark:bg-zinc-950" />
          {dayHeaders.map((h, i) => (
            <div
              key={i}
              className={[
                "sticky top-0 z-10 flex flex-col items-center justify-center border-b border-l border-zinc-200 bg-white py-1.5 dark:border-zinc-800 dark:bg-zinc-950",
                h.isToday ? "text-emerald-600 dark:text-emerald-400" : "text-zinc-500 dark:text-zinc-400",
              ].join(" ")}
            >
              <span className="text-[10px] font-medium uppercase tracking-wide">{h.label}</span>
              <span className={h.isToday ? "text-sm font-semibold" : "text-sm"}>{h.dayNum}</span>
            </div>
          ))}

          {/* Hour grid: one row per hour. Column 0 = hour labels, cols 1-7 =
              day cells. Absolutely-positioned event/proposed items are
              layered on top of each day column separately below. */}
          {hours.map((h) => (
            <div key={`h-${h}`} className="contents">
              <div className="border-t border-zinc-100 pr-1 text-right text-[9px] text-zinc-400 dark:border-zinc-900 dark:text-zinc-600">
                {h > 12 ? h - 12 : h}
                {h >= 12 ? "p" : "a"}
              </div>
              {DAY_LABELS.map((_, dayIdx) => (
                <div
                  key={`c-${h}-${dayIdx}`}
                  className="h-8 border-t border-l border-zinc-100 dark:border-zinc-900"
                />
              ))}
            </div>
          ))}

          {/* Layered items: one wrapper per day column, positioned absolute
              inside it. The wrapper spans the full grid rows so the top/
              height percentages resolve against the whole day window. */}
          {DAY_LABELS.map((_, dayIdx) => {
            const dayReal = realItems.filter((i) => i.dayIndex === dayIdx);
            const dayProposed = proposedItems.filter((i) => i.dayIndex === dayIdx);
            return (
              <div
                key={`overlay-${dayIdx}`}
                className="pointer-events-none relative"
                style={{
                  gridColumn: dayIdx + 2,
                  gridRow: `2 / span ${hours.length}`,
                }}
              >
                {dayReal.map((item) => (
                  <div
                    key={item.key}
                    className="pointer-events-auto absolute inset-x-0.5 overflow-hidden rounded-sm border border-zinc-400 bg-zinc-300 px-1 text-[9px] leading-tight text-zinc-800 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-100"
                    style={{ top: `${item.topPercent}%`, height: `${item.heightPercent}%` }}
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
                {dayProposed.map((item) => (
                  <div
                    key={item.key}
                    className={[
                      "pointer-events-auto absolute inset-x-0.5 z-[1] overflow-hidden rounded-sm border-2 px-1 text-[9px] leading-tight",
                      item.conflictsWith
                        ? "border-amber-600 bg-amber-300 text-amber-950 dark:border-amber-400 dark:bg-amber-600 dark:text-amber-50"
                        : "border-emerald-600 bg-emerald-400 text-emerald-950 dark:border-emerald-300 dark:bg-emerald-600 dark:text-emerald-50",
                    ].join(" ")}
                    style={{ top: `${item.topPercent}%`, height: `${item.heightPercent}%` }}
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
  );
}
