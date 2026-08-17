import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { cadenceCountFromText, preferredTimeFromText, relativeDayWeekdayName } from "./reconstructFromText";

describe("preferredTimeFromText", () => {
  it("extracts an explicit 'at H(:MM)(am|pm)' time", () => {
    assert.equal(
      preferredTimeFromText("Slack Spencer about offer letter today at 4:00pm"),
      "16:00",
    );
    assert.equal(preferredTimeFromText("Temple shift on Saturday from 5:00 to 10:00am"), "05:00");
  });

  it("falls back to the first bare clock time when there's no 'at'", () => {
    assert.equal(preferredTimeFromText("Date night on Friday from 6:00 to 10:00pm"), "18:00");
  });

  it("returns null when the text has no clock time at all", () => {
    assert.equal(preferredTimeFromText("Close the seed round"), null);
  });
});

describe("cadenceCountFromText", () => {
  it("recognizes a Monday-through-Friday range as 5", () => {
    assert.equal(
      cadenceCountFromText("Work out Monday through Friday from 6:15 to 7:15am"),
      5,
    );
  });

  it("recognizes 'every day' as 7", () => {
    assert.equal(cadenceCountFromText("Stretch every night"), 7);
  });

  it("recognizes an explicit Nx", () => {
    assert.equal(cadenceCountFromText("Run 3x this week"), 3);
  });

  it("returns null when the text gives no cadence signal", () => {
    assert.equal(cadenceCountFromText("Work out on Saturday at 10:30am"), null);
  });
});

// Bug fix regression: "Budgeting with Brooklyn tonight at 6:30pm" names no
// weekday at all -- weekdayFromText (blocks.ts) has no way to know
// "tonight" meant anything, so the item got no day preference and landed
// on whatever day the placement fallback happened to find room,
// disconnected from the day it was actually said. This resolves the
// relative-day word against the row's real createdAt instead.
describe("relativeDayWeekdayName", () => {
  it("resolves 'tonight'/'today' against the real creation date", () => {
    // 2026-08-17 is a Monday.
    const createdAt = new Date(2026, 7, 17, 16, 38, 0);
    assert.equal(
      relativeDayWeekdayName("Budgeting with Brooklyn tonight at 6:30pm", createdAt, "America/Denver"),
      "Monday",
    );
    assert.equal(
      relativeDayWeekdayName("Slack Spencer about offer letter today at 4:00pm", createdAt, "America/Denver"),
      "Monday",
    );
  });

  it("returns null when the text has no relative-day word", () => {
    const createdAt = new Date(2026, 7, 17, 16, 38, 0);
    assert.equal(
      relativeDayWeekdayName("Temple shift on Saturday from 5:00 to 10:00am", createdAt, "America/Denver"),
      null,
    );
  });
});
