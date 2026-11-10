import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  CONFIRM_WRITER_UNAVAILABLE_MESSAGE,
  invalidConfirmBodyResponse,
  resolveConfirmWriter,
} from "./route";

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

describe("confirm service-role writer", () => {
  it("a deployment missing its service-role key is reported honestly, with nothing written", async () => {
    const missingKey = new Error("SUPABASE_SECRET_KEY unset");
    const logged: unknown[][] = [];
    const originalError = console.error;
    console.error = (...args: unknown[]) => {
      logged.push(args);
    };
    let result: ReturnType<typeof resolveConfirmWriter>;
    try {
      result = resolveConfirmWriter(() => {
        throw missingKey;
      });
    } finally {
      console.error = originalError;
    }

    assert.ok("response" in result, "a missing key must produce a response, not a writer");
    assert.equal(result.response.status, 500);
    const text = await result.response.text();
    const body = JSON.parse(text) as { error?: string; partialWrite?: unknown };
    assert.equal(body.error, CONFIRM_WRITER_UNAVAILABLE_MESSAGE);
    assert.equal(body.partialWrite, undefined);
    assert.ok(!text.includes("don't confirm this plan again"));
    assert.ok(
      logged.some((args) => args.includes(missingKey)),
      "the thrown missing-key error must reach console.error",
    );
  });

  it("a configured deployment gets the real client, constructed once", () => {
    const sentinel = { sentinel: true } as unknown as SupabaseClient;
    let calls = 0;
    const result = resolveConfirmWriter(() => {
      calls++;
      return sentinel;
    });
    assert.ok("writer" in result);
    assert.equal(result.writer, sentinel);
    assert.equal(calls, 1);
  });

  // The ordering the card requires, asserted against POST's own body because
  // POST cannot be driven in-process: it awaits createClient(), which awaits
  // next/headers' cookies() and needs a request scope. A missing key must be
  // answered before the confirm lock is taken and before anything is written.
  it("POST builds that writer before the confirm lock and before any write", () => {
    const source = readFileSync(new URL("./route.ts", import.meta.url), "utf8");
    const postStart = source.indexOf("export async function POST(");
    assert.notEqual(postStart, -1, "POST not found in route.ts -- update this guard");
    const post = source.slice(postStart);

    const at = (marker: string) => {
      const index = post.indexOf(marker);
      assert.notEqual(
        index,
        -1,
        `marker ${JSON.stringify(marker)} not found in POST -- the route changed; update this guard`,
      );
      return index;
    };

    const writer = at("resolveConfirmWriter()");
    for (const later of ["tryBeginConfirm(", "createCalendarEvent(", "createWeeklyItems("]) {
      assert.ok(writer < at(later), `resolveConfirmWriter() must come before ${later} in POST`);
    }
  });
});
