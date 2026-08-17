import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { cadenceCountFromText, preferredTimeFromText } from "./reconstructFromText";

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
