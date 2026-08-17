import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DateTime } from "luxon";
import {
  busyRangesFromEvents,
  findFreeGaps,
  parseTimeToMinutes,
  proposeActionBlocks,
  weekdayFromText,
} from "./blocks";

describe("weekdayFromText", () => {
  it("finds a named weekday and ignores substring traps", () => {
    assert.equal(weekdayFromText("temple shift on Saturday"), 6);
    assert.equal(weekdayFromText("wear sunscreen"), null);
  });
});

describe("findFreeGaps", () => {
  it("drops gaps entirely in the past and clips a gap that straddles now", () => {
    const day = new Date(2026, 7, 10, 0, 0, 0); // Monday
    const windowStart = new Date(day);
    const windowEnd = new Date(day);
    windowEnd.setDate(windowEnd.getDate() + 1);
    const now = new Date(2026, 7, 10, 12, 0, 0);

    const gaps = findFreeGaps([], windowStart, windowEnd, now, 8, 20);
    assert.equal(gaps.length, 1);
    assert.equal(gaps[0].start.getTime(), now.getTime());
    assert.equal(gaps[0].end.getHours(), 20);
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

  it("spreads a daily habit across distinct days instead of stacking Monday", () => {
    const proposed = proposeActionBlocks(
      [{ role: "Athlete", description: "Run every morning", type: "habit", cadenceCount: 3 }],
      [],
      sunday,
      nextSunday,
      { now, blockMinutes: 45 },
    );
    const days = new Set(proposed[0].blocks.map((b) => b.start.getDay()));
    assert.equal(proposed[0].blocks.length, 3);
    assert.equal(days.size, 3);
  });

  it("honors a weekday named in a goal description", () => {
    const proposed = proposeActionBlocks(
      [{ role: "Parent", description: "Date night on Saturday", type: "goal" }],
      [],
      sunday,
      nextSunday,
      { now },
    );
    assert.equal(proposed[0].blocks.length, 1);
    assert.equal(proposed[0].blocks[0].start.getDay(), 6);
  });

  it("does not treat a future planning week as already past", () => {
    const fridayNight = new Date(2026, 7, 14, 21, 0, 0);
    const proposed = proposeActionBlocks(
      [{ role: "Athlete", description: "Lift on Monday", type: "goal", preferredTime: "07:00" }],
      [],
      nextSunday,
      new Date(2026, 7, 23, 0, 0, 0),
      { now: fridayNight, blockMinutes: 45 },
    );
    assert.equal(proposed[0].blocks.length, 1);
    assert.equal(proposed[0].blocks[0].start.getDay(), 1);
    assert.equal(proposed[0].blocks[0].start.getHours(), 7);
  });

  it("places a preferred time even outside the 8am–8pm gap window", () => {
    const proposed = proposeActionBlocks(
      [{ role: "Athlete", description: "Run on Tuesday", type: "goal", preferredTime: "07:00" }],
      [],
      sunday,
      nextSunday,
      { now, blockMinutes: 45 },
    );
    assert.equal(proposed[0].blocks[0].start.getHours(), 7);
    assert.equal(proposed[0].blocks[0].start.getDay(), 2);
  });
});

// Bug fix regression: every "local hour" computation used to go through
// native Date methods, which read the RUNNING PROCESS's timezone, not the
// timezone actually passed in -- correct by coincidence whenever the two
// happened to match (a laptop in the same zone as the user), silently
// wrong the moment they didn't (a server in UTC, a user anywhere else).
// These tests build their windows with Luxon directly, in a zone chosen
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
      [{ role: "Employee", description: "Slack Spencer about offer letter today at 4:00pm", type: "goal", preferredTime: "16:00" }],
      [],
      windowStart,
      windowEnd,
      { now, timeZone: zone },
    );

    const zonedStart = DateTime.fromJSDate(proposed[0].blocks[0].start, { zone });
    assert.equal(zonedStart.hour, 16);
    assert.equal(zonedStart.minute, 0);
  });

  it("computes the working-hours gap window in the zone given, not the process's own zone", () => {
    const windowStart = zoned({ day: 9, hour: 0 });
    const windowEnd = zoned({ day: 10, hour: 0 });

    const gaps = findFreeGaps([], windowStart, windowEnd, windowStart, 8, 20, zone);
    assert.equal(gaps.length, 1);
    assert.equal(DateTime.fromJSDate(gaps[0].start, { zone }).hour, 8);
    assert.equal(DateTime.fromJSDate(gaps[0].end, { zone }).hour, 20);
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
  // busy, so /propose found zero free slots for anything, all week, with
  // no error raised -- /confirm then reported success anyway. All-day
  // events must never count as busy time for gap-finding.
  it("does not treat all-day events as busy", () => {
    const ranges = busyRangesFromEvents([
      { status: "confirmed", start: { date: "2026-08-17" }, end: { date: "2026-08-18" } },
      { status: "confirmed", start: { date: "2026-08-18" }, end: { date: "2026-08-19" } },
    ]);
    assert.equal(ranges.length, 0);
  });

  it("still treats a real timed event as busy alongside an all-day event", () => {
    const ranges = busyRangesFromEvents([
      { status: "confirmed", start: { date: "2026-08-17" }, end: { date: "2026-08-18" } },
      {
        status: "confirmed",
        start: { dateTime: "2026-08-17T15:00:00.000Z" },
        end: { dateTime: "2026-08-17T16:00:00.000Z" },
      },
    ]);
    assert.equal(ranges.length, 1);
    assert.equal(ranges[0].start.toISOString(), "2026-08-17T15:00:00.000Z");
  });
});
