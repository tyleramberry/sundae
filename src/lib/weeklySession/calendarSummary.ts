// Formats the user's real Google Calendar events into plain-text busy-time
// context for the weekly-session engine's system prompt (see
// src/lib/engine/weeklySession.ts). Bug fix: the chat used to have zero
// calendar visibility -- /propose was the only place that ever looked at
// real events (src/lib/planning/blocks.ts), so a mid-conversation "do I
// have time for this?" got an honest-but-useless "I don't have a view of
// your calendar." This is deliberately read-only, description-only context
// for the model to reference in `reply` -- it does not change scheduling.
// Exact block placement still happens later at /propose, which does its
// own gap-finding against the same events (see busyRangesFromEvents).

import { DateTime } from "luxon";
import { busyRangesFromEvents, type GoogleCalendarEvent } from "@/lib/planning/blocks";

function formatTime(d: Date, timeZone?: string): string {
  const dt = DateTime.fromJSDate(d, { zone: timeZone ?? "local" });
  return dt.toFormat("h:mm a");
}

function dayLabel(d: Date, timeZone?: string): string {
  const dt = DateTime.fromJSDate(d, { zone: timeZone ?? "local" });
  return dt.toFormat("cccc LLL d");
}

// Renders merged busy ranges grouped by calendar day, in chronological
// order, in the user's real IANA timezone (not the server's UTC zone).
export function formatCalendarSummary(
  events: GoogleCalendarEvent[],
  timeZone?: string,
): string {
  const busy = busyRangesFromEvents(events);

  if (busy.length === 0) {
    return "This week's real Google Calendar: no existing events found -- the week looks wide open.";
  }

  const byDay = new Map<string, string[]>();
  for (const range of busy) {
    const label = dayLabel(range.start, timeZone);
    const line = `${formatTime(range.start, timeZone)}–${formatTime(range.end, timeZone)}`;
    const existing = byDay.get(label);
    if (existing) {
      existing.push(line);
    } else {
      byDay.set(label, [line]);
    }
  }

  const lines = [...byDay.entries()].map(
    ([day, ranges]) => `- ${day}: busy ${ranges.join(", ")}`,
  );

  return `This week's real Google Calendar (already-scheduled events):\n${lines.join("\n")}`;
}

// What to hand the engine when the read itself failed (no Google tokens on
// file, expired refresh token, etc.) -- still explicit context, so the
// model tells the user the real reason instead of guessing or claiming
// generic "no view of your calendar."
export const CALENDAR_UNAVAILABLE_SUMMARY =
  "This week's real Google Calendar: not available right now (not connected, or the connection needs to be refreshed) -- say so plainly if asked, don't guess at availability.";
