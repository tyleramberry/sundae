import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { canAccessDebugSurfaceForEmail, isTestAccountEmail } from "./testAccount";

const originalExtra = process.env.SUNDAE_TEST_ACCOUNTS;

afterEach(() => {
  if (originalExtra === undefined) delete process.env.SUNDAE_TEST_ACCOUNTS;
  else process.env.SUNDAE_TEST_ACCOUNTS = originalExtra;
});

describe("isTestAccountEmail", () => {
  it("matches tyleramberry@gmail.com case-insensitively and ignores whitespace", () => {
    assert.equal(isTestAccountEmail("tyleramberry@gmail.com"), true);
    assert.equal(isTestAccountEmail("  TylerAmberry@GMAIL.com "), true);
  });

  it("rejects non-test emails and empty values", () => {
    assert.equal(isTestAccountEmail("someoneelse@gmail.com"), false);
    assert.equal(isTestAccountEmail("tyleramberry@gmail.com.evil.com"), false);
    assert.equal(isTestAccountEmail(""), false);
    assert.equal(isTestAccountEmail(null), false);
    assert.equal(isTestAccountEmail(undefined), false);
  });

  it("supports additional comma-separated emails via SUNDAE_TEST_ACCOUNTS", () => {
    process.env.SUNDAE_TEST_ACCOUNTS = "qa@sundaeplanner.com, Demo@Example.com";
    assert.equal(isTestAccountEmail("qa@sundaeplanner.com"), true);
    assert.equal(isTestAccountEmail("demo@example.com"), true);
    assert.equal(isTestAccountEmail("tyleramberry@gmail.com"), true);
    assert.equal(isTestAccountEmail("other@example.com"), false);
  });
});

describe("canAccessDebugSurfaceForEmail", () => {
  it("allows anyone outside production", () => {
    assert.equal(canAccessDebugSurfaceForEmail(null, "development"), true);
    assert.equal(canAccessDebugSurfaceForEmail("random@example.com", "test"), true);
  });

  it("in production allows only test accounts", () => {
    assert.equal(canAccessDebugSurfaceForEmail("tyleramberry@gmail.com", "production"), true);
    assert.equal(canAccessDebugSurfaceForEmail("random@example.com", "production"), false);
    assert.equal(canAccessDebugSurfaceForEmail(null, "production"), false);
  });
});
