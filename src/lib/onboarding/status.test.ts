import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isOnboardingPath,
  isProductOnboardingComplete,
  resolvePostAuthDestination,
} from "./status";

describe("isProductOnboardingComplete", () => {
  it("is false for a brand-new user with no rows", () => {
    assert.equal(
      isProductOnboardingComplete({ survey: null, hasOnboardingAnswers: false }),
      false,
    );
  });

  it("is false when the survey was started but the demo never finished", () => {
    assert.equal(
      isProductOnboardingComplete({
        survey: {
          demo_goal_text: null,
          completed_at: null,
        },
        hasOnboardingAnswers: false,
      }),
      false,
    );
  });

  it("is true once the live demo persisted a goal (legacy completed users)", () => {
    assert.equal(
      isProductOnboardingComplete({
        survey: { demo_goal_text: "get back in shape", completed_at: null },
        hasOnboardingAnswers: false,
      }),
      true,
    );
  });

  it("is true when completed_at is set even without demo text", () => {
    assert.equal(
      isProductOnboardingComplete({
        survey: { demo_goal_text: null, completed_at: "2026-08-28T00:00:00.000Z" },
        hasOnboardingAnswers: false,
      }),
      true,
    );
  });

  it("is true for users who finished Stage 0 / the old chat onboarding", () => {
    assert.equal(
      isProductOnboardingComplete({ survey: null, hasOnboardingAnswers: true }),
      true,
    );
  });

  it("ignores blank demo_goal_text", () => {
    assert.equal(
      isProductOnboardingComplete({
        survey: { demo_goal_text: "   ", completed_at: null },
        hasOnboardingAnswers: false,
      }),
      false,
    );
  });
});

describe("resolvePostAuthDestination", () => {
  it("sends new users to onboarding", () => {
    assert.equal(
      resolvePostAuthDestination({ next: null, onboardingComplete: false }),
      "/onboarding",
    );
  });

  it("sends completed users to the dashboard", () => {
    assert.equal(
      resolvePostAuthDestination({ next: null, onboardingComplete: true }),
      "/dashboard",
    );
  });

  it("honors an in-app deep link", () => {
    assert.equal(
      resolvePostAuthDestination({
        next: "/weekly-session",
        onboardingComplete: true,
      }),
      "/weekly-session",
    );
  });

  it("does not honor next=/onboarding for a completed user", () => {
    assert.equal(
      resolvePostAuthDestination({
        next: "/onboarding",
        onboardingComplete: true,
      }),
      "/dashboard",
    );
    assert.equal(
      resolvePostAuthDestination({
        next: "/onboarding?meta=lead",
        onboardingComplete: true,
      }),
      "/dashboard",
    );
  });

  it("still honors next=/onboarding for a first-login user", () => {
    assert.equal(
      resolvePostAuthDestination({
        next: "/onboarding",
        onboardingComplete: false,
      }),
      "/onboarding",
    );
  });
});

describe("isOnboardingPath", () => {
  it("matches /onboarding and query variants only", () => {
    assert.equal(isOnboardingPath("/onboarding"), true);
    assert.equal(isOnboardingPath("/onboarding?meta=lead"), true);
    assert.equal(isOnboardingPath("/dashboard"), false);
    assert.equal(isOnboardingPath("/onboarding-not"), false);
  });
});
