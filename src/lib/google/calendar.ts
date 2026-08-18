import type { SupabaseClient } from "@supabase/supabase-js";
import { getGoogleTokens, saveGoogleTokens } from "@/lib/google/tokens";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const CALENDAR_API = "https://www.googleapis.com/calendar/v3";

export class GoogleCalendarError extends Error {}

// Returns a live access token for the user, refreshing it against Google
// first if it's expired (or about to expire).
async function getValidAccessToken(
  supabase: SupabaseClient,
  userId: string,
): Promise<string> {
  const tokens = await getGoogleTokens(supabase, userId);

  if (!tokens) {
    throw new GoogleCalendarError(
      "No Google tokens on file for this user. Sign in with Google first.",
    );
  }

  const expiresInMs = new Date(tokens.expires_at).getTime() - Date.now();
  const isFresh = expiresInMs > 60_000; // more than a minute left

  if (isFresh) {
    return tokens.access_token;
  }

  if (!tokens.refresh_token) {
    throw new GoogleCalendarError(
      "Google access token expired and no refresh_token is on file. Sign in again.",
    );
  }

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: tokens.refresh_token,
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new GoogleCalendarError(`Failed to refresh Google token: ${body}`);
  }

  const refreshed = (await response.json()) as {
    access_token: string;
    expires_in: number;
  };

  const expiresAt = new Date(
    Date.now() + refreshed.expires_in * 1000,
  ).toISOString();

  // If the Supabase write fails we must not return the fresh access_token:
  // the DB still holds the old expires_at, so the next call would read it
  // as expired, refresh against Google again, and loop -- burning quota on
  // every calendar-backed route until the DB recovers. Throw instead so
  // the caller knows the token state is unreliable.
  try {
    await saveGoogleTokens(supabase, {
      userId,
      accessToken: refreshed.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new GoogleCalendarError(`Failed to persist refreshed token: ${message}`);
  }

  return refreshed.access_token;
}

// Exported so callers that need the same Sun-Sat window boundaries (e.g.
// the block-proposal logic, which works off the same current-week events
// this file fetches) don't redefine week-boundary math of their own.
export function startOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay(); // 0 = Sunday
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - day);
  return d;
}

export function endOfWeek(date: Date): Date {
  const start = startOfWeek(date);
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  return end;
}

export function endOfWeekFromStart(weekStart: Date): Date {
  const end = new Date(weekStart);
  end.setDate(end.getDate() + 7);
  return end;
}

// Reads the signed-in user's primary calendar events for a Sun–Sat week.
export async function listWeekEvents(
  supabase: SupabaseClient,
  userId: string,
  weekStart: Date,
) {
  const accessToken = await getValidAccessToken(supabase, userId);

  const params = new URLSearchParams({
    timeMin: weekStart.toISOString(),
    timeMax: endOfWeekFromStart(weekStart).toISOString(),
    singleEvents: "true",
    orderBy: "startTime",
  });

  const response = await fetch(
    `${CALENDAR_API}/calendars/primary/events?${params.toString()}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );

  if (!response.ok) {
    const body = await response.text();
    throw new GoogleCalendarError(`Failed to list events: ${body}`);
  }

  return response.json();
}

// Convenience for callers that want the wall-clock current week rather
// than the planning week (debug calendar page, daily brief).
export async function listCurrentWeekEvents(
  supabase: SupabaseClient,
  userId: string,
) {
  return listWeekEvents(supabase, userId, startOfWeek(new Date()));
}

export type CreateCalendarEventInput = {
  summary: string;
  description?: string;
  start: Date;
  end: Date;
};

export type GoogleCalendarWriteResult = {
  id: string;
  [key: string]: unknown;
};

// General-purpose write, used by the weekly session's confirm step (Day 10)
// to actually put a confirmed Habit/Goal block on the user's calendar.
export async function createCalendarEvent(
  supabase: SupabaseClient,
  userId: string,
  input: CreateCalendarEventInput,
): Promise<GoogleCalendarWriteResult> {
  const accessToken = await getValidAccessToken(supabase, userId);

  const response = await fetch(`${CALENDAR_API}/calendars/primary/events`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      summary: input.summary,
      description: input.description,
      start: { dateTime: input.start.toISOString() },
      end: { dateTime: input.end.toISOString() },
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new GoogleCalendarError(`Failed to create event: ${body}`);
  }

  return response.json();
}

export type GoogleCalendarEventDetail = {
  id: string;
  status?: string;
  [key: string]: unknown;
};

// Fetches a single event by ID, for the Day 11 KPI reconciliation job --
// it needs to know whether one specific confirmed block still exists, not
// the whole week's events. Google keeps a deleted event around with
// status: "cancelled" rather than dropping it immediately, so callers must
// check both: a null return (genuinely gone/404/410) and a "cancelled"
// status both mean "this block no longer counts."
export async function getCalendarEvent(
  supabase: SupabaseClient,
  userId: string,
  eventId: string,
): Promise<GoogleCalendarEventDetail | null> {
  const accessToken = await getValidAccessToken(supabase, userId);

  const response = await fetch(
    `${CALENDAR_API}/calendars/primary/events/${encodeURIComponent(eventId)}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );

  if (response.status === 404 || response.status === 410) {
    return null;
  }

  if (!response.ok) {
    const body = await response.text();
    throw new GoogleCalendarError(`Failed to fetch event ${eventId}: ${body}`);
  }

  return response.json();
}

// Deletes a single event, for /api/weekly-session/retry-calendar's "redo"
// mode -- replacing a block that was placed at the wrong time (e.g. by the
// pre-timezone-fix version of that route) needs the stale event actually
// removed, not just orphaned on the user's real calendar while a second,
// correct one gets created alongside it. A 404/410 (already gone) is
// treated as success, same "already achieved the goal" reasoning as
// getCalendarEvent's null-on-404/410 above -- nothing left to delete.
export async function deleteCalendarEvent(
  supabase: SupabaseClient,
  userId: string,
  eventId: string,
): Promise<void> {
  const accessToken = await getValidAccessToken(supabase, userId);

  const response = await fetch(
    `${CALENDAR_API}/calendars/primary/events/${encodeURIComponent(eventId)}`,
    { method: "DELETE", headers: { Authorization: `Bearer ${accessToken}` } },
  );

  if (!response.ok && response.status !== 404 && response.status !== 410) {
    const body = await response.text();
    throw new GoogleCalendarError(`Failed to delete event ${eventId}: ${body}`);
  }
}

// Creates a short test event ~1 hour from now, to prove the write path
// works end-to-end. Kept as a thin wrapper around createCalendarEvent
// (Day 10) for the existing Day 5 debug screen (/debug/calendar).
export async function createTestEvent(
  supabase: SupabaseClient,
  userId: string,
) {
  const start = new Date(Date.now() + 60 * 60 * 1000);
  const end = new Date(start.getTime() + 30 * 60 * 1000);

  return createCalendarEvent(supabase, userId, {
    summary: "Sundae test event",
    description: "Created by Sundae's Calendar write function (Day 5).",
    start,
    end,
  });
}
