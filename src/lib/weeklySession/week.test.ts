import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatPlanningWeekRange,
  planningWeekStart,
  planningWeekStartDate,
} from "./week";

describe("planningWeekStartDate", () => {
  it("stays on this Sunday through Thursday", () => {
    const thursday = new Date(2026, 7, 13, 18, 0, 0); // Aug 13 2026
    assert.equal(planningWeekStart(thursday), "2026-08-09");
  });

  it("rolls to next Sunday on Friday and Saturday", () => {
    const friday = new Date(2026, 7, 14, 21, 0, 0);
    const saturday = new Date(2026, 7, 15, 9, 0, 0);
    assert.equal(planningWeekStart(friday), "2026-08-16");
    assert.equal(planningWeekStart(saturday), "2026-08-16");
  });

  it("formats a readable range", () => {
    const start = planningWeekStartDate(new Date(2026, 7, 15));
    assert.equal(formatPlanningWeekRange(start), "Week of 8/16 through 8/22");
  });
});
