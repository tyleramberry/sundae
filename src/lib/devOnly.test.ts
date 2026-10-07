import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { isLocalDevHost, isProductionRuntime, shouldBlockDevOnlySurface } from "./devOnly";

// NODE_ENV is typed readonly. Tests write through a loose view and restore
// whatever the process started with.
const env = process.env as { NODE_ENV?: string };
const originalNodeEnv = env.NODE_ENV;

afterEach(() => {
  if (originalNodeEnv === undefined) delete env.NODE_ENV;
  else env.NODE_ENV = originalNodeEnv;
});

describe("isProductionRuntime", () => {
  it("is true only when NODE_ENV is production", () => {
    env.NODE_ENV = "production";
    assert.equal(isProductionRuntime(), true);

    env.NODE_ENV = "development";
    assert.equal(isProductionRuntime(), false);

    env.NODE_ENV = "test";
    assert.equal(isProductionRuntime(), false);

    delete env.NODE_ENV;
    assert.equal(isProductionRuntime(), false);
  });
});

describe("isLocalDevHost", () => {
  it("matches localhost and 127.0.0.1 with or without a port", () => {
    assert.equal(isLocalDevHost("localhost"), true);
    assert.equal(isLocalDevHost("127.0.0.1"), true);
    assert.equal(isLocalDevHost("localhost:3000"), true);
    assert.equal(isLocalDevHost("127.0.0.1:3000"), true);
  });

  it("does not treat a lookalike hostname as local", () => {
    assert.equal(isLocalDevHost("localhost.evil.com"), false);
    assert.equal(isLocalDevHost("127.0.0.1.evil.com"), false);
  });
});

describe("shouldBlockDevOnlySurface", () => {
  it("blocks /auth/dev-signin on a non-local production host", () => {
    assert.equal(
      shouldBlockDevOnlySurface({
        pathname: "/auth/dev-signin",
        isLocal: false,
        nodeEnv: "production",
      }),
      true,
    );
  });

  it("blocks /api/debug/* on a non-local production host", () => {
    assert.equal(
      shouldBlockDevOnlySurface({
        pathname: "/api/debug/seed-test-account",
        isLocal: false,
        nodeEnv: "production",
      }),
      true,
    );
  });

  it("allows localhost and 127.0.0.1 even when NODE_ENV is production", () => {
    assert.equal(
      shouldBlockDevOnlySurface({
        pathname: "/auth/dev-signin",
        isLocal: true,
        nodeEnv: "production",
      }),
      false,
    );
    assert.equal(
      shouldBlockDevOnlySurface({
        pathname: "/api/debug/seed-test-account",
        isLocal: true,
        nodeEnv: "production",
      }),
      false,
    );
  });

  it("allows a non-production runtime on a public host", () => {
    assert.equal(
      shouldBlockDevOnlySurface({
        pathname: "/auth/dev-signin",
        isLocal: false,
        nodeEnv: "development",
      }),
      false,
    );
    assert.equal(
      shouldBlockDevOnlySurface({
        pathname: "/api/debug/seed-test-account",
        isLocal: false,
        nodeEnv: undefined,
      }),
      false,
    );
  });

  it("does not block product routes or other debug pages", () => {
    for (const pathname of ["/dashboard", "/auth/callback", "/debug/engine", "/api/cron/daily-follow-up"]) {
      assert.equal(
        shouldBlockDevOnlySurface({
          pathname,
          isLocal: false,
          nodeEnv: "production",
        }),
        false,
      );
    }
  });
});
