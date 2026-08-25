import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  HOURS_END,
  HOURS_START,
  dayIndexInWeek,
  eventToPositioned,
  formatHourLabel,
  gridBodyHeightPx,
  hourSlots,
  positionOnGrid,
  proposedToPositioned,
  visibleHourCount,
} from "./calendarGrid";

const weekStart = new Date(2026, 7, 23, 0, 0, 0, 0); // Sunday Aug 23 2026

function at(dayOffset: number, hour: number, minute = 0): Date {
  return new Date(2026, 7, 23 + dayOffset, hour, minute, 0, 0);
}

describe("calendarGrid window", () => {
  it("covers 6 AM through 10 PM as sixteen hour slots", () => {
    assert.equal(HOURS_START, 6);
    assert.equal(HOURS_END, 22);
    assert.equal(visibleHourCount(), 16);
    assert.deepEqual(hourSlots()[0], 6);
    assert.deepEqual(hourSlots().at(-1), 21);
    assert.equal(gridBodyHeightPx(), 16 * 40);
  });

  it("labels noon and evening without wrapping to 0", () => {
    assert.equal(formatHourLabel(6), "6 AM");
    assert.equal(formatHourLabel(12), "12 PM");
    assert.equal(formatHourLabel(17), "5 PM");
    assert.equal(formatHourLabel(21), "9 PM");
  });
});

describe("dayIndexInWeek", () => {
  it("uses local calendar dates, not elapsed milliseconds / 24h", () => {
    assert.equal(dayIndexInWeek(at(0, 9), weekStart), 0);
    assert.equal(dayIndexInWeek(at(1, 14), weekStart), 1);
    assert.equal(dayIndexInWeek(at(6, 21, 30), weekStart), 6);
  });

  it("drops events outside the Sun–Sat week", () => {
    const saturdayBefore = new Date(2026, 7, 22, 12, 0, 0, 0);
    const nextSunday = new Date(2026, 7, 30, 9, 0, 0, 0);
    assert.equal(dayIndexInWeek(saturdayBefore, weekStart), -1);
    assert.equal(dayIndexInWeek(nextSunday, weekStart), 7);
  });
});

describe("positionOnGrid", () => {
  const totalMinutes = (HOURS_END - HOURS_START) * 60;

  function placed(
    start: Date,
    end: Date,
    kind: "real" | "proposed" | "draft" = "real",
  ) {
    return positionOnGrid({
      key: "k",
      label: "Block",
      start,
      end,
      weekStart,
      kind,
    });
  }

  it("puts 6 AM at the top of the canvas", () => {
    const item = placed(at(1, 6), at(1, 7));
    assert.ok(item);
    assert.equal(item.dayIndex, 1);
    assert.equal(item.topPercent, 0);
    assert.equal(item.heightPercent, (60 / totalMinutes) * 100);
  });

  it("puts 9 AM three hours down — not compressed into the first band", () => {
    const item = placed(at(2, 9), at(2, 10));
    assert.ok(item);
    assert.equal(item.topPercent, (3 * 60 / totalMinutes) * 100);
    assert.equal(item.heightPercent, (60 / totalMinutes) * 100);
  });

  it("puts 5 PM eleven hours down, in the lower half of the grid", () => {
    const item = placed(at(3, 17), at(3, 18, 30));
    assert.ok(item);
    assert.equal(item.topPercent, (11 * 60 / totalMinutes) * 100);
    assert.equal(item.heightPercent, (90 / totalMinutes) * 100);
    assert.ok(item.topPercent > 50);
  });

  it("clips a 5 AM–8 AM event to the 6 AM top of the window", () => {
    const item = placed(at(1, 5), at(1, 8));
    assert.ok(item);
    assert.equal(item.topPercent, 0);
    assert.equal(item.heightPercent, (2 * 60 / totalMinutes) * 100);
  });

  it("clips an evening event that runs past 10 PM", () => {
    const item = placed(at(4, 21), at(4, 23));
    assert.ok(item);
    assert.equal(item.topPercent, (15 * 60 / totalMinutes) * 100);
    assert.equal(item.heightPercent, (60 / totalMinutes) * 100);
  });

  it("drops events entirely outside the visible window", () => {
    assert.equal(placed(at(1, 4), at(1, 5, 30)), null);
    assert.equal(placed(at(1, 22), at(1, 23)), null);
  });

  it("keeps an overnight block through the bottom of the column", () => {
    const item = placed(at(5, 20), at(6, 1));
    assert.ok(item);
    assert.equal(item.dayIndex, 5);
    assert.equal(item.topPercent, (14 * 60 / totalMinutes) * 100);
    assert.equal(item.heightPercent, (2 * 60 / totalMinutes) * 100);
  });
});

describe("eventToPositioned", () => {
  it("skips all-day and cancelled events", () => {
    assert.equal(
      eventToPositioned(
        { start: { date: "2026-08-24" }, end: { date: "2026-08-25" } },
        weekStart,
      ),
      null,
    );
    assert.equal(
      eventToPositioned(
        {
          status: "cancelled",
          start: { dateTime: at(1, 10).toISOString() },
          end: { dateTime: at(1, 11).toISOString() },
        },
        weekStart,
      ),
      null,
    );
  });

  it("places a Google dateTime on the local clock, including offset strings", () => {
    const start = at(1, 14);
    const end = at(1, 15);
    const item = eventToPositioned(
      {
        id: "evt-1",
        summary: "Standup",
        start: { dateTime: start.toISOString() },
        end: { dateTime: end.toISOString() },
      },
      weekStart,
    );
    assert.ok(item);
    assert.equal(item.label, "Standup");
    assert.equal(item.kind, "real");
    assert.equal(item.dayIndex, 1);
    assert.equal(item.topPercent, ((14 - HOURS_START) * 60 / ((HOURS_END - HOURS_START) * 60)) * 100);
  });
});

describe("proposedToPositioned", () => {
  it("carries conflict flags through", () => {
    const item = proposedToPositioned(
      {
        role: "Founder",
        description: "Write the update",
        start: at(2, 16).toISOString(),
        end: at(2, 17).toISOString(),
        conflictsWith: "Team meeting",
      },
      weekStart,
    );
    assert.ok(item);
    assert.equal(item.kind, "proposed");
    assert.equal(item.conflictsWith, "Team meeting");
    assert.equal(item.role, "Founder");
  });
});
