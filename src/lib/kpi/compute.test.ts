import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  computeKpisForRoles,
  computeRoleKpi,
  groupItemsByRole,
  isItemComplete,
} from "./compute";

describe("isItemComplete", () => {
  it("treats habit/goal done flags as completion", () => {
    assert.equal(isItemComplete({ type: "habit", done: true, percent: null }), true);
    assert.equal(isItemComplete({ type: "goal", done: false, percent: null }), false);
  });

  it("treats a project at 100 as complete and anything less as not", () => {
    assert.equal(isItemComplete({ type: "project", done: false, percent: 100 }), true);
    assert.equal(isItemComplete({ type: "project", done: false, percent: 99 }), false);
    assert.equal(isItemComplete({ type: "project", done: false, percent: null }), false);
  });
});

describe("computeRoleKpi", () => {
  it("uses null percent when nothing is planned, not 0", () => {
    const kpi = computeRoleKpi("Founder", []);
    assert.equal(kpi.denominator, 0);
    assert.equal(kpi.percent, null);
  });

  it("returns 0% when items exist but none are done", () => {
    const kpi = computeRoleKpi("Athlete", [
      { type: "habit", done: false, percent: null },
    ]);
    assert.equal(kpi.percent, 0);
    assert.equal(kpi.numerator, 0);
    assert.equal(kpi.denominator, 1);
  });
});

describe("computeKpisForRoles", () => {
  it("emits a tile for every role even when a role has no items", () => {
    const items = groupItemsByRole([
      { role: "Founder", type: "habit" as const, done: true, percent: null },
    ]);
    const kpis = computeKpisForRoles(["Founder", "Parent"], items);
    assert.equal(kpis.length, 2);
    assert.equal(kpis[0].percent, 100);
    assert.equal(kpis[1].percent, null);
  });
});
