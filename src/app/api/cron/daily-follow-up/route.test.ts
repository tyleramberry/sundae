import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { GET } from "./route";

// The cron route is a real production path guarded only by CRON_SECRET (fail
// closed) -- it must NOT sit behind the dev-only production switch.
const env = process.env as { NODE_ENV?: string; CRON_SECRET?: string };
const originalNodeEnv = env.NODE_ENV;
const originalCronSecret = env.CRON_SECRET;

afterEach(() => {
  if (originalNodeEnv === undefined) delete env.NODE_ENV;
  else env.NODE_ENV = originalNodeEnv;
  if (originalCronSecret === undefined) delete env.CRON_SECRET;
  else env.CRON_SECRET = originalCronSecret;
});

const url = "https://app.sundaeplanner.com/api/cron/daily-follow-up";

describe("GET /api/cron/daily-follow-up", () => {
  it("in production with no CRON_SECRET: 401 (not 404), before any admin client", async () => {
    delete env.CRON_SECRET;
    env.NODE_ENV = "production";
    const res = await GET(new Request(url));
    assert.equal(res.status, 401);
    assert.notEqual(res.status, 404);
    assert.deepEqual(await res.json(), { error: "Unauthorized" });
  });

  it("in production with a wrong bearer token: still 401", async () => {
    delete env.CRON_SECRET;
    env.NODE_ENV = "production";
    const res = await GET(new Request(url, { headers: { Authorization: "Bearer nope" } }));
    assert.equal(res.status, 401);
    assert.deepEqual(await res.json(), { error: "Unauthorized" });
  });
});
