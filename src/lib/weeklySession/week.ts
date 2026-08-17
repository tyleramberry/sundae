import { DateTime } from "luxon";

// The week Sundae is planning is not always the Sun–Sat window that
// contains "now". Late in the week (Friday or Saturday) there isn't enough
// of the current week left to plan into, so we aim at the upcoming Sunday
// instead. Every surface that keys off week_start for the live plan
// (session transcript, propose, confirm, dashboard tiles) must use this
// helper so the chat, calendar write, and KPI rings cannot disagree.
//
// Bug fix: "today"/"this week" used to be computed via native Date methods
// (.getDay(), .setHours(0,0,0,0)), which read the RUNNING PROCESS's
// timezone, not the user's -- fine locally, wrong the moment this runs on
// a server in a different zone (Vercel defaults to UTC). A user chatting
// late at night could have their session bucketed into the wrong week if
// the process's UTC "today" had already rolled over past midnight while
// their own local calendar day hadn't. Every function below now takes an
// explicit IANA `timeZone` and resolves "today" through Luxon in that
// zone; omitting it keeps the old process-local behavior (existing tests,
// and any caller that hasn't been updated to thread a real user timezone
// through yet -- see src/lib/planning/blocks.ts's DEFAULT_TIME_ZONE for
// the same fallback reasoning).
const DEFAULT_TIME_ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;

export function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function startOfLocalDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

// Zoned equivalent of startOfLocalDay -- local midnight *in `timeZone`*,
// not the running process's zone.
function startOfZonedDay(date: Date, timeZone: string): Date {
  return DateTime.fromJSDate(date, { zone: timeZone }).startOf("day").toJSDate();
}

export function planningWeekStartDate(now: Date = new Date(), timeZone: string = DEFAULT_TIME_ZONE): Date {
  const today = startOfZonedDay(now, timeZone);
  const thisSunday = DateTime.fromJSDate(today, { zone: timeZone }).startOf("week").minus({ days: 1 }).toJSDate();
  // Luxon's week starts Monday; back up one day from that to land on Sunday,
  // matching this app's Sun–Sat week throughout (startOfWeek in
  // google/calendar.ts, used by the non-zoned callers, does the same thing
  // via Date.getDay()).
  const thisSaturday = addDays(thisSunday, 6);
  // Days remaining after today in this Sun–Sat week. Thursday=2, Friday=1,
  // Saturday=0. Fewer than 2 remaining days after today means plan next week.
  const remainingAfterToday = Math.round(
    (thisSaturday.getTime() - today.getTime()) / 86_400_000,
  );
  if (remainingAfterToday < 2) {
    return addDays(thisSunday, 7);
  }
  return thisSunday;
}

export function planningWeekEndDate(weekStart: Date, timeZone: string = DEFAULT_TIME_ZONE): Date {
  return DateTime.fromJSDate(startOfZonedDay(weekStart, timeZone), { zone: timeZone })
    .plus({ days: 7 })
    .toJSDate();
}

export function planningWeekStart(now: Date = new Date(), timeZone: string = DEFAULT_TIME_ZONE): string {
  const d = planningWeekStartDate(now, timeZone);
  const zoned = DateTime.fromJSDate(d, { zone: timeZone });
  return zoned.toFormat("yyyy-MM-dd");
}

export function formatPlanningWeekRange(weekStart: Date, timeZone: string = DEFAULT_TIME_ZONE): string {
  const start = startOfZonedDay(weekStart, timeZone);
  const end = addDays(start, 6);
  const fmt = (d: Date) => {
    const zoned = DateTime.fromJSDate(d, { zone: timeZone });
    return `${zoned.month}/${zoned.day}`;
  };
  return `Week of ${fmt(start)} through ${fmt(end)}`;
}

export function parseDateOnly(iso: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}
