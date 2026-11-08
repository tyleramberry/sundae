import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { revisePlan } from "@/lib/engine/revisePlan";
import { isClassifiedAction } from "@/lib/weeklySession/parseActions";
import type { ClassifiedAction } from "@/lib/engine/weeklySessionTypes";
import { getWeeklySessionTranscript } from "@/lib/weeklySession/persist";
import { planningWeekStart } from "@/lib/weeklySession/week";
import { getFreeLimitBlock } from "@/lib/weeklySession/freeTier";
import { enforceLlmSpend } from "@/lib/llm/spendGuard";

// Confirm-screen revision step: takes the current classified plan plus a
// natural-language change and returns the revised plan. It does NOT touch
// the calendar or weekly_items -- the client re-runs /propose on the
// returned actions to get fresh blocks, so scheduling stays in one place
// (src/lib/planning/blocks.ts). Same "any request body is untrusted" stance
// as the rest of the weekly-session routes. This route spends Claude tokens
// on a body the client fully controls, so its inputs are size-capped here and
// each call reserves a row in the shared per-user spend guard
// (src/lib/llm/spendGuard.ts) before reaching Claude.

export const MAX_REVISE_MESSAGE_LENGTH = 2000;
export const MAX_REVISE_ACTIONS = 50;
// isClassifiedAction validates types but not string lengths, so an
// individual action's fields can be arbitrarily large. The whole array is
// JSON-stringified into the Claude prompt, so the serialized size of that
// array is what actually bounds the call.
export const MAX_REVISE_ACTIONS_JSON_LENGTH =
  MAX_REVISE_ACTIONS * MAX_REVISE_MESSAGE_LENGTH;

type SupabaseServer = Awaited<ReturnType<typeof createClient>>;

export type ReviseResult = { status: number; body: Record<string, unknown> };

export async function runRevisePlan(input: {
  supabase: SupabaseServer;
  user: { id: string };
  body: unknown;
  revisePlan: typeof revisePlan;
}): Promise<ReviseResult> {
  const { supabase, user } = input;
  const body = input.body as {
    actions?: unknown;
    message?: unknown;
    timeZone?: unknown;
  } | null;

  if (
    !body ||
    typeof body.message !== "string" ||
    !body.message.trim() ||
    !Array.isArray(body.actions) ||
    !body.actions.every(isClassifiedAction)
  ) {
    return {
      status: 400,
      body: {
        error:
          "Body must include a non-empty string `message` and `actions: {role, description, type, cadenceCount?, preferredTime?}[]`.",
      },
    };
  }

  // Both fields are echoed into a Claude prompt, so their size is bounded
  // here rather than trusted. Checked before the free-tier lookup and the
  // spend guard so an oversized body costs nothing.
  if (body.message.trim().length > MAX_REVISE_MESSAGE_LENGTH) {
    return {
      status: 400,
      body: {
        error: `Message is too long — keep it under ${MAX_REVISE_MESSAGE_LENGTH} characters.`,
      },
    };
  }
  if (body.actions.length > MAX_REVISE_ACTIONS) {
    return {
      status: 400,
      body: {
        error: `Too many actions — a revision can handle at most ${MAX_REVISE_ACTIONS} actions.`,
      },
    };
  }
  // The count cap alone doesn't bound the payload: isClassifiedAction
  // validates types, not string lengths, so a handful of huge actions
  // would ride the whole array into the Claude prompt. Cap the serialized
  // size the prompt actually sees.
  if (JSON.stringify(body.actions).length > MAX_REVISE_ACTIONS_JSON_LENGTH) {
    return {
      status: 400,
      body: {
        error: `Actions are too large — keep the whole plan under ${MAX_REVISE_ACTIONS_JSON_LENGTH} characters.`,
      },
    };
  }

  // Freemium gate (see freeTier.ts getFreeLimitBlock): this route takes the
  // plan from the request body, so it must not let a free user at the
  // limit drive a brand-new week without a /step session. In-progress
  // rounds and addendum weeks pass straight through.
  try {
    const freeLimit = await getFreeLimitBlock(
      supabase,
      user.id,
      await getWeeklySessionTranscript(
        supabase,
        user.id,
        planningWeekStart(
          new Date(),
          typeof body.timeZone === "string" ? body.timeZone : undefined,
        ),
      ),
    );
    if (freeLimit) {
      return { status: 402, body: freeLimit };
    }
  } catch (error) {
    console.error("[weekly-session/revise] free-tier check failed:", error);
    return { status: 500, body: { error: "Couldn't check your plan. Try again." } };
  }

  try {
    // Inside the try so a Supabase failure fails closed (502) and never
    // reaches Claude.
    const spendLimit = await enforceLlmSpend(supabase, user.id, "weekly-session/revise");
    if (spendLimit) return { status: 429, body: spendLimit };

    const result = await input.revisePlan({
      actions: body.actions,
      // Sent trimmed so the cap above bounds the whole payload, not just its
      // trimmed prefix (trailing padding would otherwise ride along).
      message: body.message.trim(),
      userId: user.id,
    });
    return { status: 200, body: result as unknown as Record<string, unknown> };
  } catch (error) {
    console.error("Plan revision failed:", error);
    return {
      status: 502,
      body: { error: "Sundae had trouble with that change — try rewording it." },
    };
  }
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const result = await runRevisePlan({ supabase, user, body, revisePlan });
  return NextResponse.json(result.body, { status: result.status });
}
