import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getSubscriptionStatus,
  getTrialStatus,
  isSubscriptionEntitled,
  isTrialEndInDay6Window,
  trialReminderWindowBounds,
} from "./trial";

describe("getTrialStatus (created_at fallback)", () => {
  it("treats a missing created_at as day 1 of an active trial", () => {
    const status = getTrialStatus(null);
    assert.equal(status.day, 1);
    assert.equal(status.daysRemaining, 6);
    assert.equal(status.isActive, true);
    assert.equal(status.isTrialing, true);
  });

  it("keeps day 7 active with 0 days remaining", () => {
    const now = Date.now();
    const start = new Date(now - 6 * 24 * 60 * 60 * 1000);
    const status = getTrialStatus(start);
    assert.equal(status.day, 7);
    assert.equal(status.daysRemaining, 0);
    assert.equal(status.isActive, true);
    assert.equal(status.isTrialing, true);
  });

  it("marks the trial ended after 7 days", () => {
    const start = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
    const status = getTrialStatus(start);
    assert.equal(status.isActive, false);
    assert.equal(status.isTrialing, false);
  });
});

describe("getSubscriptionStatus", () => {
  it("uses trial_end while Stripe status is trialing", () => {
    const now = new Date("2026-08-20T12:00:00.000Z");
    const trialEnd = new Date("2026-08-25T12:00:00.000Z");
    const status = getSubscriptionStatus(
      {
        status: "trialing",
        trial_end: trialEnd.toISOString(),
        current_period_end: trialEnd.toISOString(),
        created_at: "2026-08-18T12:00:00.000Z",
      },
      now,
    );
    assert.equal(status.isTrialing, true);
    assert.equal(status.isActive, true);
    assert.equal(status.daysRemaining, 5);
    assert.match(status.endDate, /Aug 25/);
  });

  it("does not look like a trial once the subscription is paid-active", () => {
    const now = new Date("2026-08-25T12:00:00.000Z");
    const status = getSubscriptionStatus(
      {
        status: "active",
        trial_end: "2026-08-24T12:00:00.000Z",
        current_period_end: "2026-09-24T12:00:00.000Z",
        created_at: "2026-08-18T12:00:00.000Z",
      },
      now,
    );
    assert.equal(status.isTrialing, false);
    assert.equal(status.isActive, true);
  });
});

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
