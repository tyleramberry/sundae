import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { invalidConfirmBodyResponse } from "./route";

const ROUTE_ERROR = "Body must include `proposed: ProposedAction[]` (as returned by /propose).";

const action = (extra: Record<string, unknown> = {}) => ({
  role: "Athlete",
  description: "Run",
  type: "habit",
  blocks: [{ start: "2026-08-10T15:00:00.000Z", end: "2026-08-10T15:45:00.000Z" }],
  ...extra,
});

describe("confirm body gate", () => {
  it("cadenceCount 1e9 is rejected with 400", async () => {
    const response = invalidConfirmBodyResponse([action({ cadenceCount: 1e9 })]);
    assert.notEqual(response, null);
    assert.equal(response!.status, 400);
    const body = (await response!.json()) as { error: string };
    assert.equal(body.error, ROUTE_ERROR);
  });

  it("accepts a well-formed body and an out-of-range durationMinutes is rejected with 400", async () => {
    assert.equal(invalidConfirmBodyResponse([action({ cadenceCount: 7, durationMinutes: 60 })]), null);
    for (const durationMinutes of [1e9, 1441]) {
      const response = invalidConfirmBodyResponse([action({ durationMinutes })]);
      assert.notEqual(response, null);
      assert.equal(response!.status, 400);
      const body = (await response!.json()) as { error: string };
      assert.equal(body.error, ROUTE_ERROR);
    }
  });
});
