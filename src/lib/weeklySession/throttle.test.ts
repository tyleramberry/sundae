import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { TURN_CAP, hasHitTurnCap } from "./throttle";

describe("hasHitTurnCap", () => {
  it("allows turns below the cap and stops at the cap", () => {
    assert.equal(hasHitTurnCap(0), false);
    assert.equal(hasHitTurnCap(TURN_CAP - 1), false);
    assert.equal(hasHitTurnCap(TURN_CAP), true);
    assert.equal(hasHitTurnCap(TURN_CAP + 1), true);
  });
});
