import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEV_SIGN_IN_FALLBACK, devSignInDestination, safeNext } from "./safeNext";

describe("safeNext", () => {
  it("allows a relative in-app path", () => {
    assert.equal(safeNext("/dashboard"), "/dashboard");
    assert.equal(safeNext("/weekly-session"), "/weekly-session");
  });

  it("rejects a protocol-relative path", () => {
    assert.equal(safeNext("//evil.com"), null);
  });

  it("rejects an absolute URL", () => {
    assert.equal(safeNext("https://evil.com"), null);
    assert.equal(safeNext("http://evil.com/dashboard"), null);
  });

  it("rejects a missing value", () => {
    assert.equal(safeNext(null), null);
    assert.equal(safeNext(""), null);
  });

  it("allows a relative path with a query string", () => {
    assert.equal(safeNext("/dashboard?role=Founder"), "/dashboard?role=Founder");
  });

  it("falls back for a backslash, a tab, or a newline in the path", () => {
    for (const next of ["/\\evil.com", "/\t/evil.com", "/\n/evil.com"]) {
      assert.equal(safeNext(next), null);
      assert.equal(devSignInDestination(next), "/dashboard");
    }
  });
});

describe("devSignInDestination", () => {
  it("falls back to the callback's completed-user destination", () => {
    assert.equal(DEV_SIGN_IN_FALLBACK, "/dashboard");
    assert.equal(devSignInDestination(null), "/dashboard");
    assert.equal(devSignInDestination(""), "/dashboard");
    assert.equal(devSignInDestination("//evil.com"), "/dashboard");
    assert.equal(devSignInDestination("https://evil.com"), "/dashboard");
  });

  it("keeps a safe relative path", () => {
    assert.equal(devSignInDestination("/weekly-session"), "/weekly-session");
  });
});
