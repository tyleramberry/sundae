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
});
