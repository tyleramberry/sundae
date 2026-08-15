import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fingerprintProposed, classifiedActionsFromWeeklyItems, toDateOnly } from "./persist";

describe("toDateOnly", () => {
  it("keeps local midnight on the same calendar date", () => {
    const sunday = new Date(2026, 7, 9, 0, 0, 0, 0);
    assert.equal(toDateOnly(sunday), "2026-08-09");
  });
});

describe("fingerprintProposed", () => {
  it("is stable for the same plan and changes when a block moves", () => {
    const a = [
      {
        role: "Founder",
        description: "Write the update",
        type: "goal" as const,
        blocks: [{ start: "2026-08-10T15:00:00.000Z", end: "2026-08-10T15:45:00.000Z" }],
      },
    ];
    const moved = [
      {
        ...a[0],
        blocks: [{ start: "2026-08-10T16:00:00.000Z", end: "2026-08-10T16:45:00.000Z" }],
      },
    ];
    assert.equal(fingerprintProposed(a), fingerprintProposed(a));
    assert.notEqual(fingerprintProposed(a), fingerprintProposed(moved));
  });
});

describe("classifiedActionsFromWeeklyItems", () => {
  it("collapses cadence rows and keeps one-off goals", () => {
    const actions = classifiedActionsFromWeeklyItems([
      { role: "Athlete", type: "habit", title: "Run" },
      { role: "Athlete", type: "habit", title: "Run" },
      { role: "Founder", type: "goal", title: "Send the update" },
    ]);
    assert.equal(actions.length, 2);
    const run = actions.find((a) => a.description === "Run");
    assert.equal(run?.cadenceCount, 2);
    assert.equal(actions.find((a) => a.description === "Send the update")?.type, "goal");
  });
});
