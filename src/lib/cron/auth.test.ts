import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { isAuthorizedCronRequest } from "./auth";

const original = process.env.CRON_SECRET;

afterEach(() => {
  if (original === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = original;
});

describe("isAuthorizedCronRequest", () => {
  it("fails closed when CRON_SECRET is unset", () => {
    delete process.env.CRON_SECRET;
    const request = new Request("https://example.com/api/cron/daily-follow-up", {
      headers: { authorization: "Bearer anything" },
    });
    assert.equal(isAuthorizedCronRequest(request), false);
  });

  it("rejects a missing or mismatched bearer token", () => {
    process.env.CRON_SECRET = "s3cret";
    const noHeader = new Request("https://example.com/api/cron/daily-follow-up");
    const wrong = new Request("https://example.com/api/cron/daily-follow-up", {
      headers: { authorization: "Bearer nope" },
    });
    assert.equal(isAuthorizedCronRequest(noHeader), false);
    assert.equal(isAuthorizedCronRequest(wrong), false);
  });

  it("accepts the configured bearer token", () => {
    process.env.CRON_SECRET = "s3cret";
    const request = new Request("https://example.com/api/cron/daily-follow-up", {
      headers: { authorization: "Bearer s3cret" },
    });
    assert.equal(isAuthorizedCronRequest(request), true);
  });
});
