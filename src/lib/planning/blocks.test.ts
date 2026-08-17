import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DateTime } from "luxon";
import {
  busyRangesFromEvents,
  parseTimeToMinutes,
  proposeActionBlocks,
  weekdayFromText,
} from "./blocks";

describe("weekdayFromText", () => {
  it("finds a named weekday and ignores substring traps", () => {
    assert.equal(weekdayFromText("temple shift on Saturday"), 6);
    assert.equal(weekdayFromText("wear sunscreen"), null);
  });

  // Bug fix regression: this used to match the FIRST weekday word found
  // anywhere in the text with no regard for context, so "Work out Monday
  // through Friday" returned Monday -- and every caller treats a non-null
  // weekday as "stack every block on this one day." In production a
  // 5x/week habit landed as five back-to-back blocks all on Monday
  // instead of spread across the week. A range, or "every day"/"daily"/
  // "weekdays", means no single day -- must return null so the normal
  // day-spreading logic runs instead. (Recovery-path fallback only now --
  // the live engine captures `weekday` structurally, see proposeActionBlocks.)
  it("returns null for a weekday range or an every-day phrase, not the first day mentioned", () => {
    assert.equal(weekdayFromText("Work out Monday through Friday from 6:15 to 7:15am"), null);
    assert.equal(weekdayFromText("Mon-Fri deep work block"), null);
    assert.equal(weekdayFromText("Stretch every morning"), null);
    assert.equal(weekdayFromText("Personal study on weekdays"), null);
  });
});

describe("parseTimeToMinutes", () => {
  it("accepts 24-hour and 12-hour clock strings", () => {
    assert.equal(parseTimeToMinutes("14:00"), 14 * 60);
    assert.equal(parseTimeToMinutes("7am"), 7 * 60);
    assert.equal(parseTimeToMinutes("7:30 PM"), 19 * 60 + 30);
  });
});

describe("busyRangesFromEvents", () => {
  it("skips cancelled events", () => {
    const ranges = busyRangesFromEvents([
      {
        status: "cancelled",
        start: { dateTime: "2026-08-10T15:00:00.000Z" },
        end: { dateTime: "2026-08-10T16:00:00.000Z" },
      },
    ]);
    assert.equal(ranges.length, 0);
  });

  // Bug fix regression: a production account with one all-day marker event
  // per day of the week ("Sundae AI - Day 17", a build-log entry, not a
  // literal "unavailable all day" block) had every single day read as 100%
  // busy. All-day events must never count as busy time.
  it("does not treat all-day events as busy", () => {
    const ranges = busyRangesFromEvents([
      { status: "confirmed", start: { date: "2026-08-17" }, end: { date: "2026-08-18" } },
      { status: "confirmed", start: { date: "2026-08-18" }, end: { date: "2026-08-19" } },
    ]);
    assert.equal(ranges.length, 0);
  });

  it("carries the event's summary through, for conflict messages", () => {
    const ranges = busyRangesFromEvents([
      {
        status: "confirmed",
        summary: "Wake up, pray",
        start: { dateTime: "2026-08-17T12:00:00.000Z" },
        end: { dateTime: "2026-08-17T12:30:00.000Z" },
      },
    ]);
    assert.equal(ranges.length, 1);
    assert.equal(ranges[0].summary, "Wake up, pray");
  });
});

describe("proposeActionBlocks", () => {
  const sunday = new Date(2026, 7, 9, 0, 0, 0);
  const nextSunday = new Date(2026, 7, 16, 0, 0, 0);
  const now = new Date(2026, 7, 9, 7, 0, 0);

  it("gives projects no calendar blocks", () => {
    const proposed = proposeActionBlocks(
      [{ role: "Founder", description: "Close the seed round", type: "project" }],
      [],
      sunday,
      nextSunday,
      { now },
    );
    assert.equal(proposed[0].blocks.length, 0);
  });

  it("spreads a cadence-only habit across distinct days when no day is named", () => {
    const proposed = proposeActionBlocks(
      [{ role: "Athlete", description: "Run every morning", type: "habit", cadenceCount: 3, preferredTime: "07:00" }],
      [],
      sunday,
      nextSunday,
      { now },
    );
    const days = new Set(proposed[0].blocks.map((b) => b.start.getDay()));
    assert.equal(proposed[0].blocks.length, 3);
    assert.equal(days.size, 3);
  });

  it("honors a weekday named in a goal description (legacy text fallback)", () => {
    const proposed = proposeActionBlocks(
      [{ role: "Parent", description: "Date night on Saturday", type: "goal", preferredTime: "18:00" }],
      [],
      sunday,
      nextSunday,
      { now },
    );
    assert.equal(proposed[0].blocks.length, 1);
    assert.equal(proposed[0].blocks[0].start.getDay(), 6);
  });

  it("prefers the structured `weekday` field over text when both are present", () => {
    const proposed = proposeActionBlocks(
      [{ role: "Parent", description: "Date night", type: "goal", weekday: 6, preferredTime: "18:00" }],
      [],
      sunday,
      nextSunday,
      { now },
    );
    assert.equal(proposed[0].blocks[0].start.getDay(), 6);
  });

  it("does not treat a future planning week as already past", () => {
    const fridayNight = new Date(2026, 7, 14, 21, 0, 0);
    const proposed = proposeActionBlocks(
      [{ role: "Athlete", description: "Lift", type: "goal", weekday: 1, preferredTime: "07:00" }],
      [],
      nextSunday,
      new Date(2026, 7, 23, 0, 0, 0),
      { now: fridayNight },
    );
    assert.equal(proposed[0].blocks.length, 1);
    assert.equal(proposed[0].blocks[0].start.getDay(), 1);
    assert.equal(proposed[0].blocks[0].start.getHours(), 7);
  });

  it("places a preferred time exactly, even well outside typical working hours", () => {
    const proposed = proposeActionBlocks(
      [{ role: "Athlete", description: "Run", type: "goal", weekday: 2, preferredTime: "07:00" }],
      [],
      sunday,
      nextSunday,
      { now },
    );
    assert.equal(proposed[0].blocks[0].start.getHours(), 7);
    assert.equal(proposed[0].blocks[0].start.getDay(), 2);
  });

  // Bug fix regression: "Work out Monday through Friday" used to have
  // weekdayFromText return Monday, which pinned every wanted block to the
  // SAME day. Must spread across 5 distinct days.
  it("spreads a 'Monday through Friday' habit across the week instead of stacking Monday", () => {
    const proposed = proposeActionBlocks(
      [
        {
          role: "Athlete",
          description: "Work out Monday through Friday from 6:15 to 7:15am",
          type: "habit",
          cadenceCount: 5,
          preferredTime: "06:15",
        },
      ],
      [],
      sunday,
      nextSunday,
      { now },
    );
    const days = new Set(proposed[0].blocks.map((b) => b.start.getDay()));
    assert.equal(proposed[0].blocks.length, 5);
    assert.equal(days.size, 5);
  });

  // Policy redesign (verbatim from the user): "if Sundae knows it's gonna
  // overlap an existing event, do not change it -- tell the user, are you
  // sure, and if they say yes, write it on top." A single-block ask for a
  // named day+time must stay AT that exact day and time even when it's
  // busy -- never silently move to a different day (the previous bug: a
  // real Saturday 5-10am event bumped this to Tuesday) or a different
  // time that same day (the bug after that: bumped to 9:15am for an
  // evening plan). It's flagged with `conflictsWith` instead.
  it("stays at the exact requested day and time when busy, and flags the conflict instead of moving", () => {
    const busySaturdayMorning = {
      status: "confirmed",
      summary: "Temple",
      start: { dateTime: new Date(2026, 7, 15, 5, 0, 0).toISOString() },
      end: { dateTime: new Date(2026, 7, 15, 10, 0, 0).toISOString() },
    };
    const proposed = proposeActionBlocks(
      [{ role: "Disciple of Jesus Christ", description: "Temple shift", type: "goal", weekday: 6, preferredTime: "05:00" }],
      [busySaturdayMorning],
      sunday,
      nextSunday,
      { now },
    );
    const block = proposed[0].blocks[0];
    assert.equal(proposed[0].blocks.length, 1);
    assert.equal(block.start.getDay(), 6); // still Saturday
    assert.equal(block.start.getHours(), 5); // still 5am, not bumped
    assert.match(block.conflictsWith ?? "", /Temple/);
  });

  it("has no conflictsWith when the exact slot is free", () => {
    const proposed = proposeActionBlocks(
      [{ role: "Founder", description: "Set up Meta ads", type: "goal", weekday: 2, preferredTime: "10:00" }],
      [],
      sunday,
      nextSunday,
      { now },
    );
    assert.equal(proposed[0].blocks[0].conflictsWith, undefined);
  });

  it("flags a conflict between two of Sundae's own proposed blocks in the same batch", () => {
    const proposed = proposeActionBlocks(
      [
        { role: "Founder", description: "First thing", type: "goal", weekday: 2, preferredTime: "10:00" },
        { role: "Founder", description: "Second thing", type: "goal", weekday: 2, preferredTime: "10:00" },
      ],
      [],
      sunday,
      nextSunday,
      { now },
    );
    assert.equal(proposed[0].blocks[0].conflictsWith, undefined);
    assert.ok(proposed[1].blocks[0].conflictsWith);
  });
});

// Bug fix regression: every "local hour" computation used to go through
// native Date methods, which read the RUNNING PROCESS's timezone, not the
// timezone actually passed in -- correct by coincidence whenever the two
// happened to match (a laptop in the same zone as the user), silently
// wrong the moment they didn't (a server in UTC, a user anywhere else).
// This test builds its window with Luxon directly, in a zone chosen
// specifically so it does NOT match whatever zone the test runner happens
// to execute in -- the point is to prove the *zone argument* is what
// controls the result, not the ambient environment. Confirmed against the
// actual mechanism found in production: `TZ=UTC node -e
// "new Date().setHours(8,0,0,0)"` prints 2:00 AM in America/Denver.
describe("proposeActionBlocks (explicit timezone)", () => {
  const zone = "America/Denver"; // MDT, UTC-6 in August -- deliberately not assumed to match CI's TZ.

  function zoned(parts: { day: number; hour: number; minute?: number }) {
    return DateTime.fromObject(
      { year: 2026, month: 8, day: parts.day, hour: parts.hour, minute: parts.minute ?? 0 },
      { zone },
    ).toJSDate();
  }

  it("places a preferred clock time in the zone given, not the process's own zone", () => {
    const windowStart = zoned({ day: 9, hour: 0 }); // Sunday
    const windowEnd = zoned({ day: 16, hour: 0 });
    const now = zoned({ day: 9, hour: 7 });

    const proposed = proposeActionBlocks(
      [{ role: "Employee", description: "Slack Spencer about offer letter", type: "goal", weekday: 1, preferredTime: "16:00" }],
      [],
      windowStart,
      windowEnd,
      { now, timeZone: zone },
    );

    const zonedStart = DateTime.fromJSDate(proposed[0].blocks[0].start, { zone });
    assert.equal(zonedStart.hour, 16);
    assert.equal(zonedStart.minute, 0);
    assert.equal(zonedStart.weekday, 1); // Monday
  });
});
