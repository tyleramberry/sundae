import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  GoogleCalendarError,
  listWeekEvents,
} from "@/lib/google/calendar";
import { proposeActionBlocks } from "@/lib/planning/blocks";
import { savePendingProposal } from "@/lib/weeklySession/persist";
import {
  formatPlanningWeekRange,
  planningWeekEndDate,
  planningWeekStart,
  planningWeekStartDate,
} from "@/lib/weeklySession/week";
import { isClassifiedAction } from "@/lib/weeklySession/parseActions";
import type { ClassifiedAction } from "@/lib/engine/weeklySessionTypes";

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

  const body = (await request.json().catch(() => null)) as
    | { actions?: unknown; timeZone?: unknown }
    | null;
  const actions = body?.actions;
  // Bug fix: without a real IANA timezone, every "8am-8pm working hours"
  // and every preferred-clock-time placement was computed in the SERVER's
  // zone (UTC on Vercel), not the user's -- see blocks.ts's DEFAULT_TIME_ZONE
  // comment for the exact mechanism and a production repro. Optional only
  // so a stale client that hasn't reloaded yet still gets a response
  // (falling back to the old, wrong-for-non-UTC-users behavior) instead of
  // a hard 400.
  const timeZone = typeof body?.timeZone === "string" ? body.timeZone : undefined;

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
    const now = new Date();
    const weekStartDate = planningWeekStartDate(now, timeZone);
    const events = await listWeekEvents(supabase, user.id, weekStartDate);
    const proposed = proposeActionBlocks(
      actions,
      events.items ?? [],
      weekStartDate,
      planningWeekEndDate(weekStartDate, timeZone),
      { now, timeZone },
    );

    // Dates -> ISO strings for the JSON boundary, same pattern the old Day
    // 8 route used. cadenceCount/preferredTime round-trip through here too
    // now (bug fix) -- see PendingProposedAction's comment for why.
    // conflictsWith rides along per-block: the whole point of the
    // exact-placement redesign (see blocks.ts's file header) is that a
    // block can be proposed AND overlap something real -- the confirm
    // screen needs this to ask the user before writing it, not just the
    // block's time.
    const serialized = proposed.map((action) => ({
      role: action.role,
      description: action.description,
      type: action.type,
      cadenceCount: action.cadenceCount,
      preferredTime: action.preferredTime,
      durationMinutes: action.durationMinutes,
      blocks: action.blocks.map((b) => ({
        start: b.start.toISOString(),
        end: b.end.toISOString(),
        conflictsWith: b.conflictsWith,
      })),
    }));

    await savePendingProposal(
      supabase,
      user.id,
      planningWeekStart(now, timeZone),
      serialized,
      actions as ClassifiedAction[],
    ).catch((err) => {
      // Propose itself succeeded; losing the reload snapshot shouldn't
      // fail the request. Confirm still works from the client payload.
      console.error("Failed to persist pending proposal:", err);
    });

    return NextResponse.json({
      proposed: serialized,
      weekStart: planningWeekStart(now, timeZone),
      weekLabel: formatPlanningWeekRange(weekStartDate, timeZone),
    });
  } catch (error) {
    if (error instanceof GoogleCalendarError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}
