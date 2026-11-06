import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isSubscriptionEntitled,
  isTrialEndInDay6Window,
  trialReminderWindowBounds,
} from "./billing";

describe("isSubscriptionEntitled", () => {
  it("allows trialing and active", () => {
    assert.equal(
      isSubscriptionEntitled({ status: "trialing", current_period_end: null }),
      true,
    );
    assert.equal(
      isSubscriptionEntitled({ status: "active", current_period_end: null }),
      true,
    );
    assert.equal(
      isSubscriptionEntitled({ status: "incomplete", current_period_end: null }),
      false,
    );
    assert.equal(
      isSubscriptionEntitled({ status: "incomplete_expired", current_period_end: null }),
      false,
    );
  });

  it("allows canceled/past_due only while current_period_end is in the future", () => {
    const now = new Date("2026-08-20T00:00:00.000Z");
    assert.equal(
      isSubscriptionEntitled(
        { status: "canceled", current_period_end: "2026-08-27T00:00:00.000Z" },
        now,
      ),
      true,
    );
    assert.equal(
      isSubscriptionEntitled(
        { status: "past_due", current_period_end: "2026-08-19T00:00:00.000Z" },
        now,
      ),
      false,
    );
    assert.equal(
      isSubscriptionEntitled({ status: "canceled", current_period_end: null }, now),
      false,
    );
  });
});

describe("day-6 trial reminder window", () => {
  it("matches trial_end between 24h and 48h from now", () => {
    const now = new Date("2026-08-20T00:00:00.000Z");
    assert.equal(isTrialEndInDay6Window(new Date("2026-08-20T12:00:00.000Z"), now), false);
    assert.equal(isTrialEndInDay6Window(new Date("2026-08-21T00:00:01.000Z"), now), true);
    assert.equal(isTrialEndInDay6Window(new Date("2026-08-22T00:00:00.000Z"), now), true);
    assert.equal(isTrialEndInDay6Window(new Date("2026-08-22T00:00:01.000Z"), now), false);
    assert.equal(isTrialEndInDay6Window(null, now), false);
  });

  it("exposes ISO bounds the cron can query", () => {
    const now = new Date("2026-08-20T00:00:00.000Z");
    const bounds = trialReminderWindowBounds(now);
    assert.equal(bounds.after, "2026-08-21T00:00:00.000Z");
    assert.equal(bounds.onOrBefore, "2026-08-22T00:00:00.000Z");
  });
});
