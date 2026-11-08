import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isClassifiedAction, isIncomingAction } from "./parseActions";

describe("isClassifiedAction", () => {
  it("accepts a well-formed habit and rejects garbage", () => {
    assert.equal(
      isClassifiedAction({
        role: "Athlete",
        description: "Run",
        type: "habit",
        cadenceCount: 5,
      }),
      true,
    );
    assert.equal(isClassifiedAction({ role: "Athlete" }), false);
  });

  it("accepts an optional weekday 0-6 and rejects an out-of-range one", () => {
    assert.equal(
      isClassifiedAction({ role: "Athlete", description: "Run", type: "goal", weekday: 6 }),
      true,
    );
    assert.equal(
      isClassifiedAction({ role: "Athlete", description: "Run", type: "goal", weekday: 7 }),
      false,
    );
  });
});

describe("isIncomingAction", () => {
  it("requires ISO block strings", () => {
    assert.equal(
      isIncomingAction({
        role: "Founder",
        description: "Write update",
        type: "goal",
        blocks: [{ start: "2026-08-10T15:00:00.000Z", end: "2026-08-10T15:45:00.000Z" }],
      }),
      true,
    );
    assert.equal(
      isIncomingAction({
        role: "Founder",
        description: "Write update",
        type: "goal",
        blocks: [{ start: 1, end: 2 }],
      }),
      false,
    );
  });

  it("accepts an optional conflictsWith string on a block", () => {
    assert.equal(
      isIncomingAction({
        role: "Founder",
        description: "Write update",
        type: "goal",
        blocks: [
          {
            start: "2026-08-10T15:00:00.000Z",
            end: "2026-08-10T15:45:00.000Z",
            conflictsWith: "Standup (9:00 AM–9:30 AM)",
          },
        ],
      }),
      true,
    );
  });
});

const BOUNDS_BASE = { role: "Athlete", description: "Run", type: "habit" as const };
const BOUNDS_BLOCKS = [{ start: "2026-08-10T15:00:00.000Z", end: "2026-08-10T15:45:00.000Z" }];

const VALIDATORS: [string, (v: unknown) => boolean, Record<string, unknown>][] = [
  ["isClassifiedAction", isClassifiedAction, BOUNDS_BASE],
  ["isIncomingAction", isIncomingAction, { ...BOUNDS_BASE, blocks: BOUNDS_BLOCKS }],
];

for (const [name, validate, base] of VALIDATORS) {
  describe(`${name} numeric bounds`, () => {
    it("cadenceCount must be an integer in 1..7 (or absent)", () => {
      for (const bad of [0, 8, 1e9, 2.5, "3"]) {
        assert.equal(validate({ ...base, cadenceCount: bad }), false, `cadenceCount ${String(bad)}`);
      }
      for (const good of [1, 7, undefined]) {
        assert.equal(validate({ ...base, cadenceCount: good }), true, `cadenceCount ${String(good)}`);
      }
    });

    it("durationMinutes must be an integer in 1..1440 (or absent)", () => {
      for (const bad of [0, 1441, 1e9, 1.5, "60"]) {
        assert.equal(validate({ ...base, durationMinutes: bad }), false, `durationMinutes ${String(bad)}`);
      }
      for (const good of [1, 60, 1440, undefined]) {
        assert.equal(validate({ ...base, durationMinutes: good }), true, `durationMinutes ${String(good)}`);
      }
    });
  });
}
