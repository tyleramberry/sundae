import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isFirstWeeklySessionUserMessage } from "./session";

describe("isFirstWeeklySessionUserMessage", () => {
  it("is true when there is no transcript yet", () => {
    assert.equal(isFirstWeeklySessionUserMessage(null), true);
    assert.equal(isFirstWeeklySessionUserMessage([]), true);
  });

  it("is false once a user turn exists", () => {
    assert.equal(
      isFirstWeeklySessionUserMessage([
        { from: "user" },
        { from: "engine" },
      ]),
      false,
    );
  });
});
