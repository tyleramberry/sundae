// Week calendar grid for the weekly-session split view -- Sun-Sat columns,
// hourly rows over blocks.ts's default working-hours window (8am-8pm), with
// three visual layers rendered on top:
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
// Rendered on the right side of /weekly-session throughout the flow. The
// PROPOSED blocks' start/end come from /api/weekly-session/propose, which
// does all the collision-avoidance math -- this component is pure display.

const HOURS_START = 6;
const HOURS_END = 22;
const HOUR_ROW_PX = 40;
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
  // Pixel offsets against the day-column overlay. Fixed-pixel positioning
  // (rather than % of the overlay's height) so the overlay's own height
  // never has to be a known quantity for children to land in the right
  // place -- a shorter-than-expected right-panel container used to collapse
  // events into a narrow band at the top when the % basis went indefinite
  // in some layouts.
  topPx: number;
  heightPx: number;
  kind: "real" | "proposed" | "draft";
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

function draftToPositioned(block: ProposedBlock, weekStart: Date): PositionedItem | null {
  return positionOnGrid({
    key: `draft-${block.start}-${block.role}-${block.description}`,
    label: block.description,
    role: block.role,
    start: new Date(block.start),
    end: new Date(block.end),
    weekStart,
    kind: "draft",
  });
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
  kind: "real" | "proposed" | "draft";
}): PositionedItem | null {
  // Which day column, in local time.
  const dayIndex = Math.floor((start.getTime() - weekStart.getTime()) / (24 * 60 * 60 * 1000));
  if (dayIndex < 0 || dayIndex > 6) return null;

  const startMinutes = start.getHours() * 60 + start.getMinutes();
  const endMinutes = end.getHours() * 60 + end.getMinutes();
  const windowStart = HOURS_START * 60;
  const windowEnd = HOURS_END * 60;

  // Clip to the visible window rather than dropping; a 7am-9am event should
  // still render, just clipped to the top of the grid.
  const visibleStart = Math.max(startMinutes, windowStart);
  const visibleEnd = Math.min(endMinutes, windowEnd);
  if (visibleEnd <= visibleStart) return null;

  // Convert to pixels against the fixed HOUR_ROW_PX row height -- 1 hour
  // = HOUR_ROW_PX px, so `(minutes / 60) * HOUR_ROW_PX` lands exactly on
  // the row the label column shows.
  const topPx = ((visibleStart - windowStart) / 60) * HOUR_ROW_PX;
  const heightPx = ((visibleEnd - visibleStart) / 60) * HOUR_ROW_PX;

  return {
    key,
    label,
    role,
    dayIndex,
    topPx,
    heightPx,
    kind,
  };
}

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
  const hours: number[] = [];
  for (let h = HOURS_START; h < HOURS_END; h++) hours.push(h);

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
        {/* Explicit grid-template-rows: header row auto-sizes to its
            content; every hour row is exactly HOUR_ROW_PX. Fixed pixel
            rows are what the overlays measure against below -- percent-
            based positioning depended on the grid item's own height being
            "definite" for percent children, and in some flex-shrunk parent
            layouts that basis went indefinite and collapsed every event
            into a narrow band at the top. */}
        <div
          className="grid min-w-[560px] grid-cols-[56px_repeat(7,1fr)] text-[11px]"
          style={{
            gridTemplateRows: `auto repeat(${hours.length}, ${HOUR_ROW_PX}px)`,
          }}
        >
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
              {/* Hour labels: "6 AM"/"12 PM" instead of the old cramped
                  "6a"/"12p". Column widened to 56px so "12 PM" doesn't
                  clip; font bumped a step so labels are legible without
                  zooming in. Noon = "12 PM"; midnight never appears in
                  this window (HOURS_START = 6, HOURS_END = 22).
                  `flex items-start justify-end` pins the label to the top-
                  right of its row so it aligns with the row's own border-t
                  -- an event at 9 AM lines up visually with the "9 AM"
                  label. */}
              <div className="flex items-start justify-end border-t border-zinc-100 pr-2 pt-0.5 text-[10px] font-medium tabular-nums text-zinc-500 dark:border-zinc-900 dark:text-zinc-500">
                {h === 12 ? 12 : h % 12} {h < 12 ? "AM" : "PM"}
              </div>
              {DAY_LABELS.map((_, dayIdx) => (
                <div
                  key={`c-${h}-${dayIdx}`}
                  className="border-t border-l border-zinc-100 dark:border-zinc-900"
                />
              ))}
            </div>
          ))}

          {/* Layered items: one wrapper per day column, positioned absolute
              inside it. The wrapper spans all hour rows; children position
              themselves by fixed pixel offsets (HOUR_ROW_PX * fraction-of-
              hour), which is why the explicit gridTemplateRows above uses
              fixed pixel row heights. */}
          {DAY_LABELS.map((_, dayIdx) => {
            const dayReal = realItems.filter((i) => i.dayIndex === dayIdx);
            const dayDraft = draftItems.filter((i) => i.dayIndex === dayIdx);
            const dayProposed = proposedItems.filter((i) => i.dayIndex === dayIdx);
            return (
              <div
                key={`overlay-${dayIdx}`}
                className="pointer-events-none relative"
                style={{
                  gridColumn: dayIdx + 2,
                  gridRow: `2 / span ${hours.length}`,
                  height: `${HOUR_ROW_PX * hours.length}px`,
                }}
              >
                {dayReal.map((item) => (
                  <div
                    key={item.key}
                    className="pointer-events-auto absolute inset-x-0.5 overflow-hidden rounded-sm border border-zinc-400 bg-zinc-300 px-1 text-[9px] leading-tight text-zinc-800 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-100"
                    style={{ top: `${item.topPx}px`, height: `${item.heightPx}px` }}
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
                {/* Draft layer: sits above real events but under proposed,
                    so once /propose runs and hard proposals arrive they
                    visually override the earlier draft blocks. Dashed
                    border + sky tint reads as "planning, not confirmed"
                    without competing with the sage proposed style. */}
                {dayDraft.map((item) => (
                  <div
                    key={item.key}
                    className="pointer-events-auto absolute inset-x-0.5 z-[1] overflow-hidden rounded-sm border-2 border-dashed border-sky-500 bg-sky-100 px-1 text-[9px] leading-tight text-sky-900 dark:border-sky-400 dark:bg-sky-200 dark:text-sky-900"
                    style={{ top: `${item.topPx}px`, height: `${item.heightPx}px` }}
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
                    style={{ top: `${item.topPx}px`, height: `${item.heightPx}px` }}
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
