import { NextResponse } from "next/server";
import { processMessage } from "@/lib/engine/engine";
import type { ConversationState } from "@/lib/engine/types";

// Thin HTTP wrapper around the channel-agnostic engine. This route does not
// persist state anywhere yet — the caller round-trips `state` on each call.
// That statelessness is the point: it's what proves the engine has no
// hidden dependency on the web UI or a particular transport.
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    message?: string;
    state?: ConversationState | null;
  } | null;

  if (!body || typeof body.message !== "string") {
    return NextResponse.json(
      { error: "Body must include a string `message` field." },
      { status: 400 },
    );
  }

  try {
    const result = await processMessage({ message: body.message, state: body.state });
    return NextResponse.json(result);
  } catch (error) {
    console.error("Engine step failed:", error);
    return NextResponse.json(
      { error: "The planning engine had trouble with that — try again." },
      { status: 502 },
    );
  }
}
