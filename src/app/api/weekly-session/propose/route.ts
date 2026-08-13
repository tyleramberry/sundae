import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  GoogleCalendarError,
  endOfWeek,
  listCurrentWeekEvents,
  startOfWeek,
} from "@/lib/google/calendar";
import { proposeActionBlocks } from "@/lib/planning/blocks";
import { currentWeekStart, savePendingProposal } from "@/lib/weeklySession/persist";
import type { ClassifiedAction } from "@/lib/engine/weeklySessionTypes";

function isClassifiedAction(value: unknown): value is ClassifiedAction {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.role === "string" &&
    typeof v.description === "string" &&
    (v.type === "habit" || v.type === "goal" || v.type === "project") &&
    (v.cadenceCount === undefined || typeof v.cadenceCount === "number") &&
    (v.preferredTime === undefined || typeof v.preferredTime === "string")
  );
}

// Day 10's real proposal step: takes the weekly session engine's classified
// actions (once the conversation reports `action.type === "complete"`) and
// slots Habit/Goal actions against this week's actual calendar gaps.
// Read-only, same permissions-model boundary as Day 8's version — nothing
// gets written to Google Calendar or weekly_items here, that only happens
// once the user confirms (/api/weekly-session/confirm).
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as { actions?: unknown } | null;
  const actions = body?.actions;

  if (!Array.isArray(actions) || !actions.every(isClassifiedAction)) {
    return NextResponse.json(
      {
        error:
          "Body must include `actions: {role, description, type, cadenceCount?, preferredTime?}[]`.",
      },
      { status: 400 },
    );
  }

  try {
    const events = await listCurrentWeekEvents(supabase, user.id);
    const now = new Date();
    const proposed = proposeActionBlocks(
      actions,
      events.items ?? [],
      startOfWeek(now),
      endOfWeek(now),
      { now },
    );

    // Dates -> ISO strings for the JSON boundary, same pattern the old Day
    // 8 route used.
    const serialized = proposed.map((action) => ({
      role: action.role,
      description: action.description,
      type: action.type,
      blocks: action.blocks.map((b) => ({
        start: b.start.toISOString(),
        end: b.end.toISOString(),
      })),
    }));

    await savePendingProposal(
      supabase,
      user.id,
      currentWeekStart(),
      serialized,
      actions as ClassifiedAction[],
    ).catch((err) => {
      // Propose itself succeeded; losing the reload snapshot shouldn't
      // fail the request. Confirm still works from the client payload.
      console.error("Failed to persist pending proposal:", err);
    });

    return NextResponse.json({ proposed: serialized });
  } catch (error) {
    if (error instanceof GoogleCalendarError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}
