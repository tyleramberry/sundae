import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  FREE_LIMIT_CODE,
  FREE_SESSION_LIMIT,
  freeLimitBody,
  getFreeTierAccess,
  isNewSessionBlocked,
} from "./freeTier";

const NOW = new Date("2026-11-06T12:00:00.000Z");
const FUTURE = "2026-11-20T00:00:00.000Z";
const PAST = "2026-11-01T00:00:00.000Z";

const SUBS = {
  free: null,
  trialing: { status: "trialing", current_period_end: FUTURE },
  active: { status: "active", current_period_end: FUTURE },
  pastDueInGrace: { status: "past_due", current_period_end: FUTURE },
  canceledInGrace: { status: "canceled", current_period_end: FUTURE },
  canceledExpired: { status: "canceled", current_period_end: PAST },
  pastDueExpired: { status: "past_due", current_period_end: PAST },
  incomplete: { status: "incomplete", current_period_end: null },
  incompleteExpired: { status: "incomplete_expired", current_period_end: null },
} as const;

const ENTITLED: (keyof typeof SUBS)[] = ["trialing", "active", "pastDueInGrace", "canceledInGrace"];

describe("getFreeTierAccess", () => {
  it("limit is 2", () => {
    assert.equal(FREE_SESSION_LIMIT, 2);
  });

  for (const [name, subscription] of Object.entries(SUBS) as [keyof typeof SUBS, (typeof SUBS)[keyof typeof SUBS]][]) {
    const entitled = ENTITLED.includes(name);
    for (const completedSessions of [0, 1, 2, 3]) {
      it(`${name} with ${completedSessions} completed → ${entitled || completedSessions < 2 ? "can" : "cannot"} start`, () => {
        const access = getFreeTierAccess({ subscription, completedSessions, now: NOW });
        assert.equal(access.entitled, entitled);
        assert.equal(access.completedSessions, completedSessions);
        assert.equal(access.limit, 2);
        assert.equal(access.canStartNewSession, entitled || completedSessions < 2);
      });
    }
  }

  it("clamps a nonsense count to 0", () => {
    const access = getFreeTierAccess({ subscription: null, completedSessions: -4, now: NOW });
    assert.equal(access.completedSessions, 0);
    assert.equal(access.canStartNewSession, true);
  });
});

describe("isNewSessionBlocked", () => {
  const atLimit = { canStartNewSession: false };
  const open = { canStartNewSession: true };

  it("blocks a fresh full session at the limit", () => {
    assert.equal(isNewSessionBlocked(atLimit, { weekCompleted: false, roundTurnCount: 0 }), true);
  });

  it("never blocks an in-progress round (lets session 2 finish, or a lapsed sub finish)", () => {
    assert.equal(isNewSessionBlocked(atLimit, { weekCompleted: false, roundTurnCount: 1 }), false);
    assert.equal(isNewSessionBlocked(atLimit, { weekCompleted: false, roundTurnCount: 40 }), false);
  });

  it("never blocks addendum rounds in an already-completed week", () => {
    assert.equal(isNewSessionBlocked(atLimit, { weekCompleted: true, roundTurnCount: 0 }), false);
  });

  it("never blocks when the user can start a new session", () => {
    assert.equal(isNewSessionBlocked(open, { weekCompleted: false, roundTurnCount: 0 }), false);
  });
});

describe("freeLimitBody", () => {
  it("carries the code and the count the client renders", () => {
    const body = freeLimitBody({ completedSessions: 2, limit: 2 });
    assert.equal(body.code, FREE_LIMIT_CODE);
    assert.equal(body.code, "free_limit_reached");
    assert.equal(body.completedSessions, 2);
    assert.equal(body.limit, 2);
  });
});
