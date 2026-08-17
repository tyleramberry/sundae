import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  GoogleCalendarError,
  createCalendarEvent,
  deleteCalendarEvent,
  listWeekEvents,
} from "@/lib/google/calendar";
import { proposeActionBlocks, type GoogleCalendarEvent } from "@/lib/planning/blocks";
import {
  cadenceCountFromText,
  preferredTimeFromText,
  relativeDayWeekdayName,
} from "@/lib/planning/reconstructFromText";
import { planningWeekEndDate, planningWeekStart, planningWeekStartDate } from "@/lib/weeklySession/week";
import type { ActionType, ClassifiedAction } from "@/lib/engine/weeklySessionTypes";

// Bug-fix recovery route (see busyRangesFromEvents in src/lib/planning/blocks.ts
// and the confirmationMessage fix in /api/weekly-session/confirm): an
// all-day event on every day of the week used to make /propose read the
// whole week as booked, so a confirmed session's Habit/Goal items could end
// up saved to weekly_items with no real Google Calendar event and no
// warning.
//
// Two modes, both driven by an explicit `redo` flag in the request body:
//
// - `redo: false` (default) -- "fix what's missing". Only touches rows
//   with `google_event_id is null`. Never deletes anything.
// - `redo: true` -- "start over". Touches EVERY non-project row for the
//   week, deleting any existing calendar event first. Exists because this
//   route's own first version (bug fix, second pass) shipped without the
//   timezone fix or the cadence/preferredTime reconstruction below, so an
//   earlier click of the plain "fix missing" button could already have
//   written real events at the wrong time/cadence -- once that's happened,
//   `google_event_id` is no longer null, so the safe default mode can't
//   see anything wrong with those rows anymore. Redo is the explicit,
//   user-triggered way out of that: never runs itself, always requires the
//   user to ask for it (see WeeklyPlanPanel's confirmation-gated button).
//
// Either way: a Habit reconstructed as needing more than one block gets
// the extra rows INSERTed (a single row can't hold more than one
// google_event_id); everything else is an UPDATE in place. A row this
// route can't place still ends up with no google_event_id -- surfaced in
// the response, never silently dropped or retried forever.
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as
    | { timeZone?: unknown; redo?: unknown }
    | null;
  const timeZone = typeof body?.timeZone === "string" ? body.timeZone : undefined;
  const redo = body?.redo === true;

  try {
    const weekStart = planningWeekStart(new Date(), timeZone);
    const weekStartDate = planningWeekStartDate(new Date(), timeZone);
    const weekEndDate = planningWeekEndDate(weekStartDate, timeZone);

    let query = supabase
      .from("weekly_items")
      .select("id, role, type, title, google_event_id, created_at")
      .eq("user_id", user.id)
      .eq("week_start", weekStart)
      .is("removed_at", null)
      .neq("type", "project");
    if (!redo) {
      query = query.is("google_event_id", null);
    }
    const { data: fetchedRows, error: fetchError } = await query.order("created_at", { ascending: true });

    if (fetchError) {
      throw new Error(`Failed to load items: ${fetchError.message}`);
    }

    if (!fetchedRows || fetchedRows.length === 0) {
      return NextResponse.json({
        ok: true,
        retried: 0,
        placed: 0,
        message: redo
          ? "Nothing to redo -- this week has no Habit/Goal items."
          : "Everything this week already has a real time on your calendar.",
      });
    }

    // Bug fix: a Habit reconstructed with the wrong cadence by an earlier,
    // buggier redo (see weekdayFromText's "Monday through Friday" fix in
    // blocks.ts) can have left several duplicate rows behind -- same role,
    // type, and title, each with its own (wrong) google_event_id, because
    // that earlier run's cadenceCount reconstruction correctly said "5"
    // but the placement bug still only ever asked for one weekday, so this
    // route's own "insert one extra row per additional block" logic ran
    // for each of them independently. Collapse back to one row per unique
    // (role, type, title) BEFORE reconstructing anything -- keep the
    // earliest, delete its calendar event same as any other redo target,
    // and hard-delete the extras (not just their events) so they don't
    // each independently ask for another 5 blocks and multiply further.
    const seen = new Map<string, (typeof fetchedRows)[number]>();
    const duplicateRowIds: string[] = [];
    for (const row of fetchedRows) {
      const key = `${row.role}\0${row.type}\0${row.title}`;
      const existing = seen.get(key);
      if (!existing) {
        seen.set(key, row);
        continue;
      }
      const [older, newer] = row.created_at < existing.created_at ? [row, existing] : [existing, row];
      seen.set(key, older);
      duplicateRowIds.push(newer.id);
      if (newer.google_event_id) {
        try {
          await deleteCalendarEvent(supabase, user.id, newer.google_event_id);
        } catch (err) {
          console.error(`Retry-calendar: failed to delete duplicate's stale event for "${newer.title}":`, err);
        }
      }
    }
    if (duplicateRowIds.length > 0) {
      const { error: dedupeError } = await supabase.from("weekly_items").delete().in("id", duplicateRowIds);
      if (dedupeError) {
        throw new Error(`Failed to remove duplicate rows: ${dedupeError.message}`);
      }
    }
    const rows = [...seen.values()];

    // Redo deletes whatever was there before it recomputes -- best-effort,
    // logged rather than fatal, since a stale duplicate on the calendar is
    // recoverable (the user can delete it by hand) but aborting the whole
    // redo over one delete failure isn't a better outcome.
    if (redo) {
      for (const row of rows) {
        if (!row.google_event_id) continue;
        try {
          await deleteCalendarEvent(supabase, user.id, row.google_event_id);
        } catch (err) {
          console.error(`Retry-calendar redo: failed to delete stale event for "${row.title}":`, err);
        }
      }
    }

    // Reconstruct what the structured fields would have said, from the
    // description text alone -- see reconstructFromText.ts. `cadenceCount`
    // only applies to habits; a bare 1 for everything else keeps
    // proposeActionBlocks's `wanted` formula (Math.max(1, cadenceCount ?? 1))
    // correct without special-casing goals here too. The description
    // handed to the scheduler can differ from the row's real `title` --
    // see relativeDayWeekdayName -- but the calendar event and the plan
    // panel always keep the original title.
    const actions: ClassifiedAction[] = rows.map((row) => {
      const relativeDay = relativeDayWeekdayName(row.title, new Date(row.created_at), timeZone ?? "UTC");
      return {
        role: row.role,
        // Bug fix: "Budgeting with Brooklyn tonight at 6:30pm" names no
        // weekday at all -- weekdayFromText has no way to know "tonight"
        // meant anything, so the item got no day preference and could
        // land on whatever day the fallback happened to find room,
        // completely disconnected from the day it was actually said.
        // Appending the day it was actually created on (resolved from
        // created_at, not guessed) gives weekdayFromText something to
        // find -- appended, not prepended, so an already-explicit weekday
        // earlier in the text still wins (weekdayFromText keeps whichever
        // match comes first).
        description: relativeDay ? `${row.title} (${relativeDay})` : row.title,
        type: row.type as ActionType,
        cadenceCount: row.type === "habit" ? (cadenceCountFromText(row.title) ?? undefined) : undefined,
        preferredTime: preferredTimeFromText(row.title) ?? undefined,
      };
    });

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
    const proposed = proposeActionBlocks(actions, events, weekStartDate, weekEndDate, {
      now,
      timeZone,
    });

    let placed = 0;
    const stillUnplaced: string[] = [];
    let calendarWarning: string | null = null;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const blocks = proposed[i]?.blocks ?? [];
      if (blocks.length === 0) {
        stillUnplaced.push(row.title);
        continue;
      }

      // First block updates the existing row. Any additional blocks
      // (a reconstructed multi-day habit) get their own new weekly_items
      // rows, since one existing row can't hold more than one
      // google_event_id. Each block is written and saved independently so
      // a failure partway through still keeps whatever already succeeded.
      for (let b = 0; b < blocks.length; b++) {
        const block = blocks[b];
        try {
          const event = await createCalendarEvent(supabase, user.id, {
            summary: row.title,
            description: `Sundae ${row.type} — ${row.role}`,
            start: block.start,
            end: block.end,
          });

          if (b === 0) {
            const { error: updateError } = await supabase
              .from("weekly_items")
              .update({ google_event_id: event.id, updated_at: new Date().toISOString() })
              .eq("id", row.id);
            if (updateError) {
              throw new Error(`Failed to save calendar event on weekly_items: ${updateError.message}`);
            }
          } else {
            const { error: insertError } = await supabase.from("weekly_items").insert({
              user_id: user.id,
              role: row.role,
              week_start: weekStart,
              type: row.type,
              title: row.title,
              google_event_id: event.id,
              percent: null,
            });
            if (insertError) {
              throw new Error(`Failed to save extra habit block: ${insertError.message}`);
            }
          }

          placed += 1;
        } catch (error) {
          if (error instanceof GoogleCalendarError) {
            calendarWarning = error.message;
            if (b === 0) stillUnplaced.push(row.title);
            continue;
          }
          throw error;
        }
      }
    }

    const totalWanted = rows.length + proposed.reduce((sum, p) => sum + Math.max(0, p.blocks.length - 1), 0);
    const verb = redo ? "Redid" : "Placed";
    const message = ((): string => {
      if (placed === totalWanted) {
        return `${verb} all ${placed} item${placed === 1 ? "" : "s"} on your calendar.`;
      }
      const base = `${verb} ${placed} of ${totalWanted} item${totalWanted === 1 ? "" : "s"} on your calendar.`;
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
