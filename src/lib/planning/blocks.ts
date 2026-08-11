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

// Full weekday names + common abbreviations, indexed 0=Sunday..6=Saturday
// to match Date.getDay(). Used to honor a day named directly in an action's
// description ("date night on Tuesday", "temple shift on Saturday") -- the
// engine keeps the day in the description text rather than as a structured
// field, so this is where it gets turned into an actual placement.
const WEEKDAY_WORDS: string[][] = [
  ["sunday", "sun"],
  ["monday", "mon"],
  ["tuesday", "tues", "tue"],
  ["wednesday", "weds", "wed"],
  ["thursday", "thurs", "thu"],
  ["friday", "fri"],
  ["saturday", "sat"],
];

// Returns the weekday (0-6) named in `text`, or null if none is. Whole-word
// match only, so "sunscreen" doesn't read as Sunday and "satisfy" doesn't
// read as Saturday. If two different days are named, the first one wins.
export function weekdayFromText(text: string): number | null {
  const lower = text.toLowerCase();
  let best: { index: number; at: number } | null = null;
  for (let day = 0; day < WEEKDAY_WORDS.length; day++) {
    for (const word of WEEKDAY_WORDS[day]) {
      const match = new RegExp(`\\b${word}\\b`).exec(lower);
      if (match && (best === null || match.index < best.at)) {
        best = { index: day, at: match.index };
      }
    }
  }
  return best ? best.index : null;
}

// One day's worth of candidate slots, plus a pointer to the next unused one
// so multiple actions competing for the same day don't collide.
type DaySlots = {
  weekday: number; // 0-6
  slots: TimeRange[];
  used: number;
};

// Slots the weekly session's classified actions onto the week's real free
// time. Two rules drive placement, both fixing the Day 10 behavior where
// everything piled onto the earliest gaps (a "run every day" habit landed as
// 7 back-to-back blocks on Monday, and a "shift on Saturday" goal landed
// on whatever slot came first):
//
//   1. **Habits spread one block per DAY**, not `cadenceCount` blocks in a
//      row. "Run every day" (cadence 7) puts one block on each of the next
//      available days, cycling back to the start of the week only if the
//      cadence exceeds the number of days that still have free time.
//   2. **A named weekday is honored.** If the description says "Saturday",
//      the block goes on Saturday. Goals get exactly one block; a habit that
//      names a single weekday stacks its blocks on that day.
//
// Everything else matches Day 8/10's contract: Projects get no calendar time
// (`blocks: []`), actions that run out of room get whatever fit (surfaced on
// the confirmation screen, never silently dropped), and each action's blocks
// come back sorted by start time.
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

  // Bucket blockMinutes-long candidate slots by calendar day, preserving
  // chronological order both across days and within each day. This is what
  // lets us hand out "one per day" instead of "next in a flat queue".
  const dayList: DaySlots[] = [];
  const dayByKey = new Map<string, DaySlots>();
  for (const gap of gaps) {
    let slotStart = new Date(gap.start);
    while (true) {
      const slotEnd = new Date(slotStart.getTime() + blockMinutes * 60_000);
      if (slotEnd > gap.end) break;
      const key = `${slotStart.getFullYear()}-${slotStart.getMonth()}-${slotStart.getDate()}`;
      let day = dayByKey.get(key);
      if (!day) {
        day = { weekday: slotStart.getDay(), slots: [], used: 0 };
        dayByKey.set(key, day);
        dayList.push(day);
      }
      day.slots.push({ start: new Date(slotStart), end: slotEnd });
      slotStart = slotEnd;
    }
  }

  const takeOnDay = (day: DaySlots): TimeRange | null =>
    day.used < day.slots.length ? day.slots[day.used++] : null;

  // Earliest still-unused slot across every day, in chronological order.
  const takeEarliest = (): TimeRange | null => {
    for (const day of dayList) {
      const slot = takeOnDay(day);
      if (slot) return slot;
    }
    return null;
  };

  // First day matching `weekday` that still has a free slot, or null.
  const dayForWeekday = (weekday: number): DaySlots | null =>
    dayList.find((d) => d.weekday === weekday && d.used < d.slots.length) ?? null;

  return actions.map((action): ProposedAction => {
    const base = { role: action.role, description: action.description, type: action.type };

    if (action.type === "project") {
      return { ...base, blocks: [] };
    }

    const targetWeekday = weekdayFromText(action.description);
    const blocks: TimeRange[] = [];

    if (action.type === "goal") {
      // One block. On its named day if it has one, else the earliest slot.
      const slot =
        targetWeekday !== null
          ? (dayForWeekday(targetWeekday) && takeOnDay(dayForWeekday(targetWeekday)!)) ||
            takeEarliest()
          : takeEarliest();
      if (slot) blocks.push(slot);
    } else {
      // Habit: cadenceCount occurrences, one per distinct day.
      const wanted = Math.max(1, action.cadenceCount ?? 1);

      if (targetWeekday !== null) {
        // Names a specific weekday ("stretch every Sunday") -- stack the
        // occurrences on that day, falling back to the earliest open slot
        // once that day is full.
        for (let i = 0; i < wanted; i++) {
          const day = dayForWeekday(targetWeekday);
          const slot = (day && takeOnDay(day)) || takeEarliest();
          if (slot) blocks.push(slot);
        }
      } else if (dayList.length > 0) {
        // "Every day" / "3x a week": one block per day, cycling through the
        // days that have free time so a 7x cadence over 6 open days lands
        // six-then-one rather than all-on-one-day.
        for (let i = 0; i < wanted; i++) {
          const day = dayList[i % dayList.length];
          const slot = takeOnDay(day) ?? takeEarliest();
          if (slot) blocks.push(slot);
        }
      }
    }

    blocks.sort((a, b) => a.start.getTime() - b.start.getTime());
    return { ...base, blocks };
  });
}
