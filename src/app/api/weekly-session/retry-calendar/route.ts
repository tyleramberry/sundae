import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { GoogleCalendarError, createCalendarEvent, listWeekEvents } from "@/lib/google/calendar";
import { proposeActionBlocks, type GoogleCalendarEvent } from "@/lib/planning/blocks";
import { planningWeekEndDate, planningWeekStart, planningWeekStartDate } from "@/lib/weeklySession/week";
import type { ActionType, ClassifiedAction } from "@/lib/engine/weeklySessionTypes";

// Bug-fix recovery route (see busyRangesFromEvents in src/lib/planning/blocks.ts
// and the confirmationMessage fix in /api/weekly-session/confirm): an
// all-day event on every day of the week used to make /propose read the
// whole week as booked, so a confirmed session's Habit/Goal items could end
// up saved to weekly_items with no real Google Calendar event and no
// warning. This route is the recovery path for exactly that state -- find
// this week's already-confirmed items that never got a calendar slot, and
// retry them now that the underlying bug is fixed, using the real fixed
// scheduler and the real calendar.
//
// Deliberately narrow: it only ever touches rows that already exist and
// already have `google_event_id is null` -- it UPDATEs those rows in place
// (setting google_event_id once a write succeeds), it never INSERTs a new
// weekly_items row and never re-runs the chat/classification. A row this
// route can't place still ends up with no google_event_id, same as before
// -- it's surfaced in the response, not silently dropped or retried forever.
//
// One known fidelity gap, called out here rather than hidden: because the
// original bug meant createWeeklyItems only ever inserted ONE fallback row
// per action (see that function's `eventIds.length === 0` branch), a Habit
// meant to recur several times a week (cadenceCount > 1) only has a single
// row to retry -- this route gives it exactly one calendar block, not the
// originally-intended cadence. The user can always add the rest as new
// items through the normal chat.
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  try {
    const weekStart = planningWeekStart();
    const weekStartDate = planningWeekStartDate();
    const weekEndDate = planningWeekEndDate(weekStartDate);

    const { data: rows, error: fetchError } = await supabase
      .from("weekly_items")
      .select("id, role, type, title")
      .eq("user_id", user.id)
      .eq("week_start", weekStart)
      .is("removed_at", null)
      .is("google_event_id", null)
      .neq("type", "project")
      .order("created_at", { ascending: true });

    if (fetchError) {
      throw new Error(`Failed to load unplaced items: ${fetchError.message}`);
    }

    if (!rows || rows.length === 0) {
      return NextResponse.json({
        ok: true,
        retried: 0,
        placed: 0,
        message: "Everything this week already has a real time on your calendar.",
      });
    }

    const actions: ClassifiedAction[] = rows.map((row) => ({
      role: row.role,
      description: row.title,
      type: row.type as ActionType,
    }));

    let events: GoogleCalendarEvent[];
    try {
      const result = await listWeekEvents(supabase, user.id, weekStartDate);
      events = result.items ?? [];
    } catch (error) {
      if (error instanceof GoogleCalendarError) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
      throw error;
    }

    const now = new Date();
    // Index-aligned with `rows`/`actions` -- proposeActionBlocks preserves
    // input order (a straight `actions.map(...)`), so `proposed[i]` is
    // always the slot(s) for `rows[i]`.
    const proposed = proposeActionBlocks(actions, events, weekStartDate, weekEndDate, { now });

    let placed = 0;
    const stillUnplaced: string[] = [];
    let calendarWarning: string | null = null;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const block = proposed[i]?.blocks[0];
      if (!block) {
        stillUnplaced.push(row.title);
        continue;
      }

      try {
        const event = await createCalendarEvent(supabase, user.id, {
          summary: row.title,
          description: `Sundae ${row.type} — ${row.role}`,
          start: block.start,
          end: block.end,
        });

        const { error: updateError } = await supabase
          .from("weekly_items")
          .update({ google_event_id: event.id, updated_at: new Date().toISOString() })
          .eq("id", row.id);

        if (updateError) {
          throw new Error(`Failed to save calendar event on weekly_items: ${updateError.message}`);
        }

        placed += 1;
      } catch (error) {
        if (error instanceof GoogleCalendarError) {
          calendarWarning = error.message;
          stillUnplaced.push(row.title);
          continue;
        }
        throw error;
      }
    }

    const message = ((): string => {
      if (placed === rows.length) {
        return `Placed all ${placed} item${placed === 1 ? "" : "s"} on your calendar.`;
      }
      const base = `Placed ${placed} of ${rows.length} item${rows.length === 1 ? "" : "s"} on your calendar.`;
      if (calendarWarning) {
        return `${base} Calendar write failed for the rest: ${calendarWarning}`;
      }
      return `${base} Still no free gap this week for: ${stillUnplaced.join(", ")}.`;
    })();

    return NextResponse.json({
      ok: true,
      retried: rows.length,
      placed,
      stillUnplaced,
      calendarWarning: calendarWarning ?? undefined,
      message,
    });
  } catch (error) {
    console.error("Retry calendar failed:", error);
    return NextResponse.json(
      { error: "Couldn't retry the calendar write — try again." },
      { status: 502 },
    );
  }
}
