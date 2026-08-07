import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { GoogleCalendarError, createCalendarEvent } from "@/lib/google/calendar";
import { createWeeklyItems } from "@/lib/weeklySession/persist";
import type { ProposedAction } from "@/lib/planning/blocks";

type IncomingBlock = { start: string; end: string };
type IncomingAction = {
  role: string;
  description: string;
  type: "habit" | "goal" | "project";
  blocks: IncomingBlock[];
};

function isIncomingAction(value: unknown): value is IncomingAction {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.role === "string" &&
    typeof v.description === "string" &&
    (v.type === "habit" || v.type === "goal" || v.type === "project") &&
    Array.isArray(v.blocks) &&
    v.blocks.every(
      (b) =>
        b &&
        typeof b === "object" &&
        typeof (b as Record<string, unknown>).start === "string" &&
        typeof (b as Record<string, unknown>).end === "string",
    )
  );
}

// The confirm step: the only place in the whole weekly session that
// actually writes anything. Per the MVP spec's permissions model ("Read
// calendar -> propose blocks -> user confirms -> write"), this route only
// runs once the user has seen /api/weekly-session/propose's output and
// hit confirm (possibly after editing block times client-side -- this
// route trusts the shape, not the specific times, same as any request
// body).
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as { proposed?: unknown } | null;
  const proposed = body?.proposed;

  if (!Array.isArray(proposed) || !proposed.every(isIncomingAction)) {
    return NextResponse.json(
      { error: "Body must include `proposed: ProposedAction[]` (as returned by /propose)." },
      { status: 400 },
    );
  }

  try {
    const withEventIds: (ProposedAction & { eventIds: string[] })[] = [];

    for (const action of proposed as IncomingAction[]) {
      if (action.type === "project") {
        withEventIds.push({
          role: action.role,
          description: action.description,
          type: "project",
          blocks: [],
          eventIds: [],
        });
        continue;
      }

      const eventIds: string[] = [];
      for (const block of action.blocks) {
        const start = new Date(block.start);
        const end = new Date(block.end);
        const event = await createCalendarEvent(supabase, user.id, {
          summary: action.description,
          description: `Sundae ${action.type} — ${action.role}`,
          start,
          end,
        });
        eventIds.push(event.id);
      }

      withEventIds.push({
        role: action.role,
        description: action.description,
        type: action.type,
        blocks: action.blocks.map((b) => ({ start: new Date(b.start), end: new Date(b.end) })),
        eventIds,
      });
    }

    const created = await createWeeklyItems(supabase, user.id, new Date(), withEventIds);

    return NextResponse.json({ ok: true, itemsCreated: created });
  } catch (error) {
    if (error instanceof GoogleCalendarError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}
