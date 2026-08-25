// Display math for WeekCalendarGrid -- one coordinate system for the time
// gutter and the event overlay. The weekly-session UI is the only caller;
// this file exists so placement can be unit-tested without rendering React.
//
// Visible window is 6am–10pm local. Stale comments elsewhere still mention
// 8am–8pm (blocks.ts's old default working hours); this grid is wider on
// purpose so early runs and evening blocks still show.

export const HOURS_START = 6;
export const HOURS_END = 22;
export const HOUR_ROW_PX = 40;
export const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

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
  conflictsWith?: string;
};

export type PositionedItem = {
  key: string;
  label: string;
  role?: string;
  dayIndex: number; // 0=Sun..6=Sat
  // Offsets as a fraction of the day-column canvas (0–100). The canvas
  // height is `gridBodyHeightPx()`, and every hour slot is `HOUR_ROW_PX`,
  // so 9:00 AM is always 3/16 of the column -- the same box the "9 AM"
  // label lives in. Percent-of-sibling-grid-area used to collapse into a
  // 6–9am band when that area's height went indefinite.
  topPercent: number;
  heightPercent: number;
  kind: "real" | "proposed" | "draft";
  conflictsWith?: string;
};

export function visibleHourCount(): number {
  return HOURS_END - HOURS_START;
}

export function gridBodyHeightPx(): number {
  return visibleHourCount() * HOUR_ROW_PX;
}

export function hourSlots(): number[] {
  const hours: number[] = [];
  for (let h = HOURS_START; h < HOURS_END; h++) hours.push(h);
  return hours;
}

export function formatHourLabel(hour: number): string {
  const display = hour === 12 ? 12 : hour % 12;
  return `${display} ${hour < 12 ? "AM" : "PM"}`;
}

function localDayStart(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function minutesOfLocalDay(date: Date): number {
  return date.getHours() * 60 + date.getMinutes();
}

export function dayIndexInWeek(start: Date, weekStart: Date): number {
  const startDay = localDayStart(start).getTime();
  const weekDay = localDayStart(weekStart).getTime();
  return Math.round((startDay - weekDay) / 86_400_000);
}

export function positionOnGrid({
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
  const dayIndex = dayIndexInWeek(start, weekStart);
  if (dayIndex < 0 || dayIndex > 6) return null;

  const windowStart = HOURS_START * 60;
  const windowEnd = HOURS_END * 60;
  const totalMinutes = windowEnd - windowStart;
  const startMinutes = minutesOfLocalDay(start);

  // Events that run past midnight (or into a later local day) still occupy
  // this column through the bottom of the visible window rather than
  // disappearing because end-clock < start-clock.
  let endMinutes = minutesOfLocalDay(end);
  const startDay = localDayStart(start).getTime();
  const endDay = localDayStart(end).getTime();
  if (endDay > startDay) {
    const extraDays = Math.round((endDay - startDay) / 86_400_000);
    endMinutes += extraDays * 24 * 60;
  }

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

export function eventToPositioned(
  event: CalendarEvent,
  weekStart: Date,
): PositionedItem | null {
  if (event.status === "cancelled") return null;
  const startRaw = event.start?.dateTime;
  const endRaw = event.end?.dateTime;
  if (!startRaw || !endRaw) return null;
  return positionOnGrid({
    key: event.id ?? `${startRaw}-${endRaw}`,
    label: event.summary ?? "(no title)",
    start: new Date(startRaw),
    end: new Date(endRaw),
    weekStart,
    kind: "real",
  });
}

export function proposedToPositioned(
  block: ProposedBlock,
  weekStart: Date,
): PositionedItem | null {
  const positioned = positionOnGrid({
    key: `proposed-${block.start}-${block.role}-${block.description}`,
    label: block.description,
    role: block.role,
    start: new Date(block.start),
    end: new Date(block.end),
    weekStart,
    kind: "proposed",
  });
  return positioned && block.conflictsWith
    ? { ...positioned, conflictsWith: block.conflictsWith }
    : positioned;
}

export function draftToPositioned(
  block: ProposedBlock,
  weekStart: Date,
): PositionedItem | null {
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
