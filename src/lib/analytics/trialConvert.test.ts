import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isTrialConvertedToActive } from "./trialConvert";

describe("isTrialConvertedToActive", () => {
  it("is true when status moves from trialing to active", () => {
    assert.equal(isTrialConvertedToActive("active", { status: "trialing" }), true);
  });

  it("is false when the subscription was already active", () => {
    assert.equal(isTrialConvertedToActive("active", { status: "active" }), false);
  });

  it("is false without previous_attributes so routine updates are not conversions", () => {
    assert.equal(isTrialConvertedToActive("active", null), false);
    assert.equal(isTrialConvertedToActive("active", undefined), false);
  });

  it("treats trial_end changing while status is active as a conversion", () => {
    assert.equal(isTrialConvertedToActive("active", { trial_end: 1_700_000_000 }), true);
  });

  it("is false while still trialing", () => {
    assert.equal(isTrialConvertedToActive("trialing", { status: "incomplete" }), false);
  });
});
