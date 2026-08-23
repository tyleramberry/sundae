// Block-proposal logic (Day 8, reworked Day 10, redesigned again after a
// live bug-bash session -- see the redesign note below).
//
// Channel-agnostic and Google-agnostic on purpose, same spirit as the
// engine (src/lib/engine): this module is pure data-in/data-out. Per the
// MVP spec's permissions model ("Read calendar -> propose blocks -> user
// confirms -> write"), nothing here ever touches the Google Calendar API —
// that write step is Day 10's wiring, gated on user confirmation.
//
// REDESIGN: this used to run a multi-step fallback cascade -- try the exact
// time, then a different time the same day, then any free slot that day,
// then (for habits) other days entirely -- to always land *somewhere*.
// Traced against a real account's real week, that produced correct-looking
// but wrong results turn after turn: an evening plan silently placed at
// 9am because the evening was busy, a Saturday temple shift silently moved
// to Tuesday because Saturday morning was taken. The user's own framing,
// verbatim: "if Sundae knows it's gonna overlap an existing event, do not
// change it -- tell the user, are you sure, and if they say yes, write it
// on top." That's the actual policy now: every action gets placed at
// EXACTLY the day and time it was given. If that collides with something,
// the block is still returned -- with `conflictsWith` describing what it
// collides with -- and it's the confirm screen's job to ask before writing
// it, never this module's job to go looking for a different slot instead.
// The only thing still "found" rather than dictated is WHICH day, and only
// when the user never named one at all (see `placeAction` below).

import { DateTime } from "luxon";
import type { ClassifiedAction } from "@/lib/engine/weeklySessionTypes";

export type TimeRange = {
  start: Date;
  end: Date;
};

// A busy range read off the real calendar, carrying the source event's
// title so a conflict can be described to the user ("overlaps with 'Wake
// up, pray' 6:00–6:30am") instead of just "something's there."
export type BusyRange = TimeRange & { summary?: string };

// One proposed calendar block. `conflictsWith` is set when this exact slot
// collides with something already on the calendar (a real event, or
// another block this same batch already placed) -- the block is still
// returned, never silently moved or dropped, so the confirm screen can
// show the user exactly what it would overlap and let them decide.
export type ProposedBlock = TimeRange & {
  conflictsWith?: string;
};

// One role/type-classified action, with the calendar slot(s) proposed for
// it: `cadenceCount` slots for a Habit, exactly one for a Goal, none at all
// for a Project (empty array, never populated — Projects are never given
// calendar time).
export type ProposedAction = {
  role: string;
  description: string;
  type: ClassifiedAction["type"];
  blocks: ProposedBlock[];
  // Carried through from the input ClassifiedAction so a Habit/Goal that
  // ends up with 0 blocks (asked-for time already in the past, e.g.)
  // doesn't also lose the only record of what it was actually supposed to
  // be -- see createWeeklyItems (persist.ts).
  cadenceCount?: number;
  preferredTime?: string;
  // The block length the user asked for, in integer minutes. Applied per
  // action rather than as one uniform batch default, so a 2-hour date
  // night and a 15-min check-in in the same session end up as the sizes
  // the user actually said. Falls back to the batch default (see
  // ProposeBlocksOptions.blockMinutes / DEFAULT_BLOCK_MINUTES) when the
  // engine never captured one for this item.
  durationMinutes?: number;
  // Habit-only recurrence intent captured by the engine. Pass-through here
  // -- blocks.ts does not use it for placement (cadenceCount + weekday
  // inference already place this week's occurrences as they always did);
  // the calendar layer reads it at confirm-write time to attach an RRULE
  // to the master event, so future weeks recur without a second write
  // path. See ClassifiedAction.recurrence for shape.
  recurrence?: ClassifiedAction["recurrence"];
};

// A Google Calendar API event is either timed (start.dateTime/end.dateTime)
// or all-day (start.date/end.date). We only need enough of the shape to
// find busy time, not the full event schema. `summary` is the event's
// title, carried through to `BusyRange.summary` for conflict messages.
export type GoogleCalendarEvent = {
  status?: string;
  summary?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
};

const DEFAULT_BLOCK_MINUTES = 45;
// Only used when an action genuinely has no preferredTime at all -- the
// live engine always asks for a real clock time (see SHARED_ITEM_RULES),
// so this should be unreachable in practice. A defensive fallback, not a
// design choice: better to place something reasonable than crash.
const DEFAULT_FALLBACK_MINUTES = 9 * 60; // 9:00am

// Bug fix: every "local day"/"local hour" computation in this file used to
// go through native Date methods (.setHours, .getDay, .getFullYear, ...),
// which are always in the RUNNING PROCESS's timezone -- fine on a laptop
// where that happens to match the user, silently wrong the moment this
// runs on a server in a different zone. In production (Vercel, TZ=UTC) for
// a Denver (UTC-6) user, "8am-8pm working hours" was actually computed as
// 8am-8pm UTC = 2am-2pm Denver, and every preferred-clock-time request
// ("4:00pm") landed at 16:00 UTC = 10:00am Denver instead. Confirmed
// directly: `TZ=UTC node -e "new Date().setHours(8,0,0,0)"` prints as
// 2:00 AM in America/Denver. Every function below that reads the wall
// clock takes an explicit IANA `timeZone` and goes through Luxon, which
// actually knows how to ask "what hour is it in this zone" instead of
// assuming the answer is whatever zone the process happens to be in.
// Defaults to the process's own zone only so callers that genuinely don't
// have a real one yet (existing tests, anything not yet threading a user
// timezone through) keep their prior behavior rather than silently
// changing -- every live route now passes the browser's actual zone.
const DEFAULT_TIME_ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;

type ProposeBlocksOptions = {
  now?: Date;
  blockMinutes?: number;
  timeZone?: string;
};

// Converts raw Google Calendar events into normalized busy ranges. All-day
// events (start.date/end.date, no dateTime) are deliberately never counted
// as busy -- this app's own all-day entries are day-labels and build-log
// markers ("Sundae AI - Day 17"), not literal "unavailable sunrise to
// sunset" blocks, and Google itself doesn't show them as Busy by default.
// A production account with one all-day marker per day of the week once
// had the whole week read as 100% booked because of this; see git history
// for the incident. Only a timed event (a real start/end clock time)
// counts as busy for conflict detection now.
export function busyRangesFromEvents(events: GoogleCalendarEvent[]): BusyRange[] {
  const ranges: BusyRange[] = [];

  for (const event of events) {
    if (event.status === "cancelled") continue;

    if (event.start?.dateTime && event.end?.dateTime) {
      ranges.push({
        start: new Date(event.start.dateTime),
        end: new Date(event.end.dateTime),
        summary: event.summary,
      });
    }
  }

  return mergeRanges(ranges);
}

// Merges overlapping/touching ranges so a conflict check only has to scan
// one entry per contiguous busy stretch. When two ranges merge, the
// earlier one's summary wins -- an approximation (a 3-event-deep merge
// only names the first), acceptable since this only ever feeds a
// human-readable hint, never a scheduling decision.
function mergeRanges(ranges: BusyRange[]): BusyRange[] {
  if (ranges.length === 0) return [];
  const sorted = [...ranges].sort((a, b) => a.start.getTime() - b.start.getTime());
  const merged: BusyRange[] = [{ ...sorted[0] }];

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

// Full weekday names + common abbreviations, indexed 0=Sunday..6=Saturday
// to match Date.getDay(). Bug-fix recovery path only now (see
// reconstructFromText.ts and /api/weekly-session/retry-calendar) -- the
// live engine captures the day structurally as `ClassifiedAction.weekday`
// instead of stating it in text, so proposeActionBlocks below no longer
// calls this on the live path at all. Kept for backfilling OLD data that
// predates the structured field, and as a defensive fallback if `weekday`
// is ever missing despite the description naming a day.
const WEEKDAY_WORDS: string[][] = [
  ["sunday", "sun"],
  ["monday", "mon"],
  ["tuesday", "tues", "tue"],
  ["wednesday", "weds", "wed"],
  ["thursday", "thurs", "thu"],
  ["friday", "fri"],
  ["saturday", "sat"],
];

const ANY_WEEKDAY_WORD = WEEKDAY_WORDS.flat().join("|");
// "Monday through Friday" / "Mon-Fri" / "Tuesday to Thursday" -- a range
// naming two DIFFERENT weekdays connected by "through"/"to"/"-". Checked
// before the single-weekday match below.
const WEEKDAY_RANGE = new RegExp(
  `\\b(?:${ANY_WEEKDAY_WORD})\\b\\s*(?:through|to|-)\\s*\\b(?:${ANY_WEEKDAY_WORD})\\b`,
  "i",
);
const EVERY_DAY_PHRASE = /\bevery\s+day\b|\bevery\s+morning\b|\bevery\s+night\b|\bdaily\b|\bweekdays?\b/i;

// Returns the weekday (0-6) named in `text`, or null if none is (including
// when the only weekday-shaped words found are part of a RANGE, not a
// single day). Whole-word match only, so "sunscreen" doesn't read as
// Sunday and "satisfy" doesn't read as Saturday. If two different single
// days are named, the first one wins.
export function weekdayFromText(text: string): number | null {
  if (WEEKDAY_RANGE.test(text) || EVERY_DAY_PHRASE.test(text)) return null;

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

// "HH:MM", "7am", "7:00 PM" -> minutes since local midnight, or null.
export function parseTimeToMinutes(time: string | undefined): number | null {
  if (!time) return null;
  const t = time.trim().toLowerCase();
  const ampm = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/.exec(t);
  if (ampm) {
    let h = Number(ampm[1]);
    const m = Number(ampm[2] ?? 0);
    if (h < 1 || h > 12 || m > 59) return null;
    if (ampm[3] === "pm" && h < 12) h += 12;
    if (ampm[3] === "am" && h === 12) h = 0;
    return h * 60 + m;
  }
  const hm = /^([0-1]?\d|2[0-3]):([0-5]\d)$/.exec(t);
  if (!hm) return null;
  return Number(hm[1]) * 60 + Number(hm[2]);
}

// Luxon's weekday is 1=Monday..7=Sunday; this file (and Date.getDay())
// uses 0=Sunday..6=Saturday throughout, so every zoned-weekday read goes
// through this one conversion.
export function zonedWeekday(date: Date, timeZone: string): number {
  return DateTime.fromJSDate(date, { zone: timeZone }).weekday % 7;
}

// Order to try days in when NO single day was named at all (a cadence-only
// habit, or -- practically never, since the engine always asks -- a Goal
// with no day). Monday-first: a fresh work week reads more naturally than
// starting mid-weekend. Not used at all once a specific day IS named --
// see placeAction below, which never substitutes a different day for one
// the user actually stated.
const DEFAULT_DAY_ORDER = [1, 2, 3, 4, 5, 0, 6];

// Slots the weekly session's classified actions onto the week, honoring
// exactly what was asked -- see the file header for why this no longer
// searches for a different time or day when the exact ask collides with
// something. Two things are still genuinely "found" rather than dictated:
//
//   1. **Which days a multi-block Habit lands on**, when it doesn't name a
//      single day itself ("run every day" -> one block per day, Mon-Sat-
//      then-Sun in order) or names one day but needs more occurrences than
//      one day can hold.
//   2. **Which day a day-less action lands on**, in DEFAULT_DAY_ORDER,
//      always at the exact requested clock time.
//
// Everything else is exact: Projects get no calendar time (`blocks: []`);
// every other block is placed at precisely its requested day+time, flagged
// with `conflictsWith` rather than moved if that collides with something;
// and blocks come back sorted by start time.
export function proposeActionBlocks(
  actions: ClassifiedAction[],
  events: GoogleCalendarEvent[],
  windowStart: Date,
  windowEnd: Date,
  options: ProposeBlocksOptions = {},
): ProposedAction[] {
  const timeZone = options.timeZone ?? DEFAULT_TIME_ZONE;
  const nowRaw = options.now ?? new Date();
  // If the planning window is in the future (Friday/Saturday rolling to
  // next week), wall-clock `now` would clip every slot as "already past".
  const now = nowRaw < windowStart ? new Date(windowStart) : nowRaw;
  const blockMinutes = options.blockMinutes ?? DEFAULT_BLOCK_MINUTES;
  const zonedWindowStart = DateTime.fromJSDate(windowStart, { zone: timeZone }).startOf("day");

  // `claimed` starts from the real calendar and grows as this batch places
  // its own blocks, so two new items proposed in the same batch also flag
  // a conflict against each other, not just against pre-existing events.
  const claimed: BusyRange[] = busyRangesFromEvents(events).map((b) => ({ ...b }));

  function describeConflict(start: Date, end: Date): string | undefined {
    const hit = claimed.find((r) => start < r.end && end > r.start);
    if (!hit) return undefined;
    const fmt = (d: Date) => DateTime.fromJSDate(d, { zone: timeZone }).toFormat("h:mm a");
    const title = hit.summary?.trim() || "a busy event";
    return `${title} (${fmt(hit.start)}–${fmt(hit.end)})`;
  }

  // Places one block at the exact clock time (`minutesOfDay`, in
  // `timeZone`) on the given weekday offset from `windowStart` (0=the
  // window's own Sunday .. 6=Saturday). Returns null only when that exact
  // instant is genuinely outside what can be scheduled at all -- already
  // past, or outside this planning window -- never because something else
  // is already there; a real collision is *reported*, not treated as a
  // reason to skip. `lengthMinutes` is per-block so a 2-hour date night
  // and a 15-min check-in in the same batch each get the size the user
  // actually asked for -- falls back to the batch default only when the
  // engine never captured one for this specific item.
  function placeAt(
    dayOffset: number,
    minutesOfDay: number,
    lengthMinutes: number,
  ): ProposedBlock | null {
    const start = zonedWindowStart
      .plus({ days: dayOffset })
      .set({ hour: Math.floor(minutesOfDay / 60), minute: minutesOfDay % 60, second: 0, millisecond: 0 })
      .toJSDate();
    if (start < now || start < windowStart || start >= windowEnd) return null;
    const end = new Date(start.getTime() + lengthMinutes * 60_000);
    const conflictsWith = describeConflict(start, end);
    const block: ProposedBlock = conflictsWith ? { start, end, conflictsWith } : { start, end };
    // Reserve it (even if it conflicts) so later items in this same batch
    // see it as busy too, and so a multi-block habit never proposes two of
    // its own occurrences on top of each other.
    claimed.push({ start, end, summary: undefined });
    return block;
  }

  return actions.map((action): ProposedAction => {
    const base = {
      role: action.role,
      description: action.description,
      type: action.type,
      cadenceCount: action.cadenceCount,
      preferredTime: action.preferredTime,
      durationMinutes: action.durationMinutes,
      recurrence: action.recurrence,
    };

    if (action.type === "project") {
      return { ...base, blocks: [] };
    }

    const wanted = action.type === "habit" ? Math.max(1, action.cadenceCount ?? 1) : 1;
    const minutesOfDay = parseTimeToMinutes(action.preferredTime) ?? DEFAULT_FALLBACK_MINUTES;
    // Per-action length wins over the batch default. Only falls through to
    // `blockMinutes` (which itself defaults to DEFAULT_BLOCK_MINUTES) when
    // this item genuinely has no captured duration.
    const lengthMinutes =
      typeof action.durationMinutes === "number" && action.durationMinutes > 0
        ? action.durationMinutes
        : blockMinutes;
    // Structured field first (the live engine's own path); text-parsing is
    // only a fallback for data captured before this field existed, or the
    // rare case the model named a day in prose but somehow left the field
    // out.
    const namedDay = action.weekday ?? weekdayFromText(action.description);

    const blocks: ProposedBlock[] = [];
    const dayOrder =
      namedDay !== null
        ? [namedDay, ...DEFAULT_DAY_ORDER.filter((d) => d !== namedDay)]
        : DEFAULT_DAY_ORDER;

    for (const day of dayOrder) {
      if (blocks.length >= wanted) break;
      // A single-block ask (any Goal; a Habit with cadenceCount 1) that
      // named a day only ever gets that ONE day tried -- never a
      // different one, even if this exact slot is unreachable (past). A
      // multi-block Habit, or an action with no day named at all, keeps
      // going through the rest of `dayOrder` to fill every occurrence.
      if (namedDay !== null && wanted === 1 && day !== namedDay) break;
      const block = placeAt(day, minutesOfDay, lengthMinutes);
      if (block) blocks.push(block);
    }

    blocks.sort((a, b) => a.start.getTime() - b.start.getTime());
    return { ...base, blocks };
  });
}
