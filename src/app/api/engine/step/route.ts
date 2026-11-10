import { NextResponse } from "next/server";
import { processMessage } from "@/lib/engine/engine";
import { createClient } from "@/lib/supabase/server";
import { enforceLlmSpend } from "@/lib/llm/spendGuard";
import {
  TURN_CAP,
  TURN_CAP_MESSAGE,
  hasHitTurnCap,
} from "@/lib/weeklySession/throttle";
import type { ConversationState } from "@/lib/engine/types";

// Thin HTTP wrapper around the channel-agnostic onboarding engine. Used by
// production Stage 0 (roles setup on /weekly-session) and, locally, by
// /debug/engine. Requires a signed-in session: this route spends Claude
// tokens and used to be callable with no auth. The turn cap below is
// computed from a number the client supplies, so it is a cheap UX guard for
// a well-behaved client and nothing more -- a scripted client just sends an
// empty `state` every time. The real per-user bound is enforceLlmSpend
// (src/lib/llm/spendGuard.ts), and the input bounds in runEngineStep live
// here with it; the engine itself stays I/O-free.

export const MAX_ENGINE_MESSAGE_LENGTH = 2000;
// The turn cap bounds turn COUNT, not turn size: `state` comes off the
// wire and is echoed back into the Claude prompt, so a single turn's
// content can be arbitrarily large. Cap the serialized turns at what
// TURN_CAP legitimate turns of MAX_ENGINE_MESSAGE_LENGTH each would be.
export const MAX_ENGINE_TURNS_JSON_LENGTH = TURN_CAP * MAX_ENGINE_MESSAGE_LENGTH;

type SupabaseServer = Awaited<ReturnType<typeof createClient>>;

export type RouteResult = { status: number; body: Record<string, unknown> };

export async function runEngineStep(input: {
  supabase: SupabaseServer;
  user: { id: string };
  body: unknown;
  processMessage: typeof processMessage;
}): Promise<RouteResult> {
  const body = input.body as {
    message?: unknown;
    state?: ConversationState | null;
  } | null;

  if (!body || typeof body.message !== "string") {
    return {
      status: 400,
      body: { error: "Body must include a string `message` field." },
    };
  }

  // The message is the client's own text, echoed straight back into a
  // Claude prompt, so its size is bounded here rather than trusted.
  if (body.message.length > MAX_ENGINE_MESSAGE_LENGTH) {
    return {
      status: 400,
      body: {
        error: `Message is too long -- keep it under ${MAX_ENGINE_MESSAGE_LENGTH} characters.`,
      },
    };
  }

  // Guard the property access: `state` comes off the wire, so it may be any
  // JSON value, not just the ConversationState the type claims.
  const rawTurns =
    body.state && typeof body.state === "object"
      ? (body.state as { turns?: unknown }).turns
      : undefined;
  if (rawTurns !== undefined && !Array.isArray(rawTurns)) {
    return { status: 400, body: { error: "state.turns must be an array." } };
  }

  // A well-behaved client can never legitimately send more than TURN_CAP
  // turns (the server 429s once it reaches the cap), so anything longer is
  // malformed input, not a rate limit -- which is why this sits before the
  // cap check below and returns 400.
  if (rawTurns !== undefined && rawTurns.length > TURN_CAP) {
    return {
      status: 400,
      body: { error: `state.turns can't be longer than ${TURN_CAP} turns.` },
    };
  }

  // Size cap on the same wire data: the array and length checks above
  // bound turn COUNT, not string lengths, so a short array of huge turns
  // would otherwise ride the whole conversation into the Claude prompt.
  if (rawTurns !== undefined && JSON.stringify(rawTurns).length > MAX_ENGINE_TURNS_JSON_LENGTH) {
    return {
      status: 400,
      body: {
        error: `state.turns is too large — keep the conversation under ${MAX_ENGINE_TURNS_JSON_LENGTH} characters.`,
      },
    };
  }

  // Cheap client-declared guard for a well-behaved client that has run a
  // session long enough to see the friendly message. NOT a security control:
  // the client supplies this number, so a script just sends fewer turns. The
  // spend guard below is the real bound.
  const turnCount = body.state?.turns.length ?? 0;
  if (hasHitTurnCap(turnCount)) {
    return { status: 429, body: { error: TURN_CAP_MESSAGE } };
  }

  try {
    const limit = await enforceLlmSpend(input.supabase, input.user.id, "engine/step");
    if (limit) return { status: 429, body: limit };

    const result = await input.processMessage({
      message: body.message,
      state: body.state,
      userId: input.user.id,
    });
    return { status: 200, body: result };
  } catch (error) {
    console.error("Engine step failed:", error);
    return {
      status: 502,
      body: { error: "The planning engine had trouble with that — try again." },
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
  const result = await runEngineStep({ supabase, user, body, processMessage });
  return NextResponse.json(result.body, { status: result.status });
}
