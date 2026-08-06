// Block-proposal logic (Day 8).
//
// Channel-agnostic and Google-agnostic on purpose, same spirit as the
// engine (src/lib/engine): this module is pure data-in/data-out. It takes
// the role goals captured during onboarding plus the user's existing
// calendar events, and returns a list of *proposed* time blocks. Per the
// MVP spec's permissions model ("Read calendar -> propose blocks -> user
// confirms -> write"), nothing here ever touches the Google Calendar API —
// that write step is Day 10's job, gated on user confirmation.

import type { RoleAnswer } from "@/lib/engine/types";

export type TimeRange = {
  start: Date;
  end: Date;
};

export type ProposedBlock = {
  role: string;
  goal: string;
  start: string; // ISO 8601
  end: string; // ISO 8601
};

// A Google Calendar API event is either timed (start.dateTime/end.dateTime)
// or all-day (start.date/end.date). We only need enough of the shape to
// find busy time, not the full event schema.
export type GoogleCalendarEvent = {
  status?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
};

const DEFAULT_BLOCK_MINUTES = 45;
const DEFAULT_DAY_START_HOUR = 8; // 8am local
const DEFAULT_DAY_END_HOUR = 20; // 8pm local

type ProposeBlocksOptions = {
  now?: Date;
  blockMinutes?: number;
  dayStartHour?: number;
  dayEndHour?: number;
};

// Converts raw Google Calendar events into normalized busy ranges. All-day
// events block the entire local day (Google represents an all-day event's
// `end.date` as exclusive, i.e. the day after it ends).
export function busyRangesFromEvents(events: GoogleCalendarEvent[]): TimeRange[] {
  const ranges: TimeRange[] = [];

  for (const event of events) {
    if (event.status === "cancelled") continue;

    if (event.start?.dateTime && event.end?.dateTime) {
      ranges.push({
        start: new Date(event.start.dateTime),
        end: new Date(event.end.dateTime),
      });
    } else if (event.start?.date && event.end?.date) {
      ranges.push({
        start: dateOnlyToLocalMidnight(event.start.date),
        end: dateOnlyToLocalMidnight(event.end.date),
      });
    }
  }

  return mergeRanges(ranges);
}

function dateOnlyToLocalMidnight(dateStr: string): Date {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function mergeRanges(ranges: TimeRange[]): TimeRange[] {
  if (ranges.length === 0) return [];
  const sorted = [...ranges].sort((a, b) => a.start.getTime() - b.start.getTime());
  const merged: TimeRange[] = [sorted[0]];

  for (const range of sorted.slice(1)) {
    const last = merged[merged.length - 1];
    if (range.start.getTime() <= last.end.getTime()) {
      if (range.end.getTime() > last.end.getTime()) last.end = range.end;
    } else {
      merged.push({ ...range });
    }
  }

  return merged;
}

// Finds the open gaps within each day's working-hours window (default
// 8am-8pm local) across [windowStart, windowEnd), after subtracting busy
// ranges. Gaps entirely in the past (relative to `now`) are dropped, and a
// gap straddling `now` is clipped to start at `now` — there is no point
// proposing a block for a time slot that has already passed today.
export function findFreeGaps(
  busy: TimeRange[],
  windowStart: Date,
  windowEnd: Date,
  now: Date,
  dayStartHour: number = DEFAULT_DAY_START_HOUR,
  dayEndHour: number = DEFAULT_DAY_END_HOUR,
): TimeRange[] {
  const gaps: TimeRange[] = [];

  for (
    let day = new Date(windowStart);
    day < windowEnd;
    day.setDate(day.getDate() + 1)
  ) {
    const dayStart = new Date(day);
    dayStart.setHours(dayStartHour, 0, 0, 0);
    const dayEnd = new Date(day);
    dayEnd.setHours(dayEndHour, 0, 0, 0);

    // Busy ranges that overlap this day's working window, sorted.
    const dayBusy = busy
      .filter((b) => b.start < dayEnd && b.end > dayStart)
      .sort((a, b) => a.start.getTime() - b.start.getTime());

    let cursor = dayStart;
    for (const b of dayBusy) {
      const busyStart = b.start < dayStart ? dayStart : b.start;
      const busyEnd = b.end > dayEnd ? dayEnd : b.end;
      if (busyStart > cursor) {
        gaps.push({ start: cursor, end: busyStart });
      }
      if (busyEnd > cursor) cursor = busyEnd;
    }
    if (cursor < dayEnd) {
      gaps.push({ start: cursor, end: dayEnd });
    }
  }

  // Drop anything fully in the past, clip anything straddling `now`.
  return gaps
    .map((g) => (g.start < now ? { start: now, end: g.end } : g))
    .filter((g) => g.start < g.end);
}

// Slots each role's stated goals into the available gaps, one block per
// goal, `blockMinutes` long. Roles are interleaved round-robin (role 1's
// first goal, role 2's first goal, ... role 1's second goal, ...) rather
// than exhausted one at a time, so the earliest/best slots in the week
// don't all go to whichever role happened to be listed first. Goals that
// run out of gap room are simply omitted — the guided session (Day 10+) is
// where the user gets to see and adjust what didn't fit.
export function proposeBlocks(
  answers: RoleAnswer[],
  events: GoogleCalendarEvent[],
  windowStart: Date,
  windowEnd: Date,
  options: ProposeBlocksOptions = {},
): ProposedBlock[] {
  const now = options.now ?? new Date();
  const blockMinutes = options.blockMinutes ?? DEFAULT_BLOCK_MINUTES;

  const busy = busyRangesFromEvents(events);
  const gaps = findFreeGaps(
    busy,
    windowStart,
    windowEnd,
    now,
    options.dayStartHour,
    options.dayEndHour,
  ).sort((a, b) => a.start.getTime() - b.start.getTime());

  // Flatten each gap into a queue of blockMinutes-long candidate slots so
  // we can hand them out one at a time as goals are interleaved.
  const slotQueue: TimeRange[] = [];
  for (const gap of gaps) {
    let slotStart = new Date(gap.start);
    while (true) {
      const slotEnd = new Date(slotStart.getTime() + blockMinutes * 60_000);
      if (slotEnd > gap.end) break;
      slotQueue.push({ start: new Date(slotStart), end: slotEnd });
      slotStart = slotEnd;
    }
  }

  const goalQueue: { role: string; goal: string }[] = [];
  const maxGoals = Math.max(0, ...answers.map((a) => a.goals.length));
  for (let i = 0; i < maxGoals; i++) {
    for (const answer of answers) {
      if (answer.goals[i]) {
        goalQueue.push({ role: answer.role, goal: answer.goals[i] });
      }
    }
  }

  const proposed: ProposedBlock[] = [];
  for (let i = 0; i < goalQueue.length && i < slotQueue.length; i++) {
    const slot = slotQueue[i];
    proposed.push({
      role: goalQueue[i].role,
      goal: goalQueue[i].goal,
      start: slot.start.toISOString(),
      end: slot.end.toISOString(),
    });
  }

  return proposed;
}
