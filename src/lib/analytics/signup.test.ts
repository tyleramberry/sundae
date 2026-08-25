import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { appendSearchParam, isNewSignup, NEW_SIGNUP_WINDOW_MS } from "./signup";

describe("isNewSignup", () => {
  const now = new Date("2026-08-25T12:00:00.000Z");

  it("is true when created_at is within the 2-minute window", () => {
    const created = new Date(now.getTime() - 90_000).toISOString();
    assert.equal(isNewSignup(created, now), true);
  });

  it("is false for a returning account created earlier", () => {
    assert.equal(isNewSignup("2026-08-01T12:00:00.000Z", now), false);
  });

  it("is false for missing or invalid created_at", () => {
    assert.equal(isNewSignup(null, now), false);
    assert.equal(isNewSignup(undefined, now), false);
    assert.equal(isNewSignup("not-a-date", now), false);
  });

  it("treats the window as inclusive at the boundary", () => {
    const created = new Date(now.getTime() - NEW_SIGNUP_WINDOW_MS).toISOString();
    assert.equal(isNewSignup(created, now), true);
    const justOutside = new Date(now.getTime() - NEW_SIGNUP_WINDOW_MS - 1).toISOString();
    assert.equal(isNewSignup(justOutside, now), false);
  });
});

describe("appendSearchParam", () => {
  it("adds a query to a bare path", () => {
    assert.equal(appendSearchParam("/onboarding", "meta", "lead"), "/onboarding?meta=lead");
  });

  it("preserves existing params", () => {
    assert.equal(appendSearchParam("/onboarding?next=1", "meta", "lead"), "/onboarding?next=1&meta=lead");
  });
});
