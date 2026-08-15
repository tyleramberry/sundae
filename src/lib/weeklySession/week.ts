import { startOfWeek } from "@/lib/google/calendar";

// The week Sundae is planning is not always the Sun–Sat window that
// contains "now". Late in the week (Friday or Saturday) there isn't enough
// of the current week left to plan into, so we aim at the upcoming Sunday
// instead. Every surface that keys off week_start for the live plan
// (session transcript, propose, confirm, dashboard tiles) must use this
// helper so the chat, calendar write, and KPI rings cannot disagree.

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

export function planningWeekStartDate(now: Date = new Date()): Date {
  const today = startOfLocalDay(now);
  const thisSunday = startOfWeek(today);
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

export function planningWeekEndDate(weekStart: Date): Date {
  return addDays(startOfLocalDay(weekStart), 7);
}

export function planningWeekStart(now: Date = new Date()): string {
  const d = planningWeekStartDate(now);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function formatPlanningWeekRange(weekStart: Date): string {
  const start = startOfLocalDay(weekStart);
  const end = addDays(start, 6);
  const fmt = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}`;
  return `Week of ${fmt(start)} through ${fmt(end)}`;
}

export function parseDateOnly(iso: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}
