import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildLlmMonitoringParams, llmSessionId } from "./traced";

describe("buildLlmMonitoringParams", () => {
  it("returns nothing when PostHog is off", () => {
    assert.deepEqual(
      buildLlmMonitoringParams(false, { spanName: "onboarding" }, "trace-1"),
      {},
    );
  });

  it("attaches distinct id, session, and immediate flush when on", () => {
    const params = buildLlmMonitoringParams(
      true,
      {
        distinctId: "user-1",
        sessionId: "user-1:onboarding",
        spanName: "onboarding",
      },
      "trace-1",
    );
    assert.equal(params.posthogDistinctId, "user-1");
    assert.equal(params.posthogTraceId, "trace-1");
    assert.equal(params.posthogCaptureImmediate, true);
    assert.deepEqual(params.posthogProperties, {
      $ai_span_name: "onboarding",
      feature: "onboarding",
      $ai_session_id: "user-1:onboarding",
    });
  });
});

describe("llmSessionId", () => {
  it("omits a session when there is no user", () => {
    assert.equal(llmSessionId(undefined, "onboarding"), undefined);
  });

  it("namespaces by user and call site", () => {
    assert.equal(llmSessionId("abc", "weekly:2026-08-23"), "abc:weekly:2026-08-23");
  });
});
