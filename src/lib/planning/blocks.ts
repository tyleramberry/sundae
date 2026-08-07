// Block-proposal logic (Day 8, reworked Day 10).
//
// Channel-agnostic and Google-agnostic on purpose, same spirit as the
// engine (src/lib/engine): this module is pure data-in/data-out. Per the
// MVP spec's permissions model ("Read calendar -> propose blocks -> user
// confirms -> write"), nothing here ever touches the Google Calendar API —
// that write step is Day 10's wiring, gated on user confirmation.
//
// Day 8 shipped this against raw onboarding goal strings — one flat block
// per goal, no notion of Habit/Goal/Project or cadence. That predates the
// weekly-session engine (docs/weekly-session-flow.md) and its
// classification step. This version consumes the engine's typed
// `ClassifiedAction[]` output instead: Habit/Goal actions get slotted
// against calendar gaps same as before, Project actions get no calendar
// involvement at all — their progress lives entirely in the in-app percent
// slider (Day 12), not on the calendar.

import type { ClassifiedAction } from "@/lib/engine/weeklySessionTypes";

export type TimeRange = {
  start: Date;
  end: Date;
};

// One role/type-classified action, with the calendar slot(s) proposed for
// it: `cadenceCount` slots for a Habit, exactly one for a Goal, none at all
// for a Project (empty array, never populated — Projects are never given
// calendar time).
export type ProposedAction = {
  role: string;
  description: string;
  type: ClassifiedAction["type"];
  blocks: TimeRange[];
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

// Slots the weekly session's classified actions into the available
// calendar gaps, `blockMinutes` long each. Actions are consumed in the
// order the engine produced them — which is already role-by-role in this
// week's role order (see weeklySession.ts), so the earliest slots in the
// week naturally go to whichever role the user worked through first in the
// conversation, not to a fixed priority order. A Habit action consumes
// `cadenceCount` (or 1) consecutive slots off the queue; a Goal consumes
// exactly one; a Project consumes none — it gets `blocks: []` and is never
// given calendar time at all, per the MVP spec's Project definition.
// Actions that run out of gap room get whatever blocks did fit (fewer than
// `cadenceCount` for a Habit, possibly zero) — the confirmation screen
// (Day 10's wiring step) is where the user sees and adjusts what didn't
// fit, same as Day 8's original "omitted, not silently dropped" stance.
export function proposeActionBlocks(
  actions: ClassifiedAction[],
  events: GoogleCalendarEvent[],
  windowStart: Date,
  windowEnd: Date,
  options: ProposeBlocksOptions = {},
): ProposedAction[] {
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
  // we can hand them out in order as actions are processed.
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

  let slotIndex = 0;
  return actions.map((action): ProposedAction => {
    if (action.type === "project") {
      return { role: action.role, description: action.description, type: action.type, blocks: [] };
    }

    const wanted = action.type === "habit" ? Math.max(1, action.cadenceCount ?? 1) : 1;
    const blocks: TimeRange[] = [];
    for (let i = 0; i < wanted && slotIndex < slotQueue.length; i++) {
      blocks.push(slotQueue[slotIndex]);
      slotIndex++;
    }

    return { role: action.role, description: action.description, type: action.type, blocks };
  });
}
