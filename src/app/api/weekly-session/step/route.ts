import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { processWeeklySessionMessage } from "@/lib/engine/weeklySession";
import {
  getLastWeekContext,
  getWeeklySessionTranscript,
  saveWeeklySessionTranscript,
  StaleTranscriptError,
  type DisplayTurn,
} from "@/lib/weeklySession/persist";
import {
  formatPlanningWeekRange,
  planningWeekStart,
  planningWeekStartDate,
} from "@/lib/weeklySession/week";
import { getOnboardingAnswers } from "@/lib/onboarding/persist";
import {
  SESSION_THROTTLE_MESSAGE,
  TURN_CAP_MESSAGE,
  hasHitTurnCap,
  hasStartedSessionToday,
  recordSessionStart,
} from "@/lib/weeklySession/throttle";
import type { WeeklySessionMode } from "@/lib/engine/weeklySessionTypes";
import { listWeekEvents, GoogleCalendarError } from "@/lib/google/calendar";
import {
  CALENDAR_UNAVAILABLE_SUMMARY,
  formatCalendarSummary,
} from "@/lib/weeklySession/calendarSummary";
import { captureServerEvent } from "@/lib/analytics/server";
import { isFirstWeeklySessionUserMessage } from "@/lib/analytics/session";

// Thin HTTP wrapper around the weekly-session engine, same shape as
// /api/engine/step for onboarding, with one structural change (Day 16):
// the server, not the client, now owns the conversation. The client only
// ever sends `message` -- the current round's ConversationState is loaded
// from weekly_session_transcripts here and saved back after every turn, so
// the chat survives a refresh/lost connection/closed tab (persistence),
// and picking "full" vs. "addendum" mode (see WeeklySessionMode) is a
// server-side decision the client doesn't have to track either. This also
// removes the class of stale-closure bug the old client-round-tripped
// `state` was prone to -- see weekly-session/page.tsx's git history.
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as
    | { message?: string; timeZone?: unknown }
    | null;

  if (!body || typeof body.message !== "string") {
    return NextResponse.json(
      { error: "Body must include a string `message` field." },
      { status: 400 },
    );
  }
  // Bug fix: threaded through to week.ts so this route's "which week is
  // this" boundary agrees with /propose and /confirm's -- see those
  // routes and blocks.ts's DEFAULT_TIME_ZONE comment.
  const timeZone = typeof body.timeZone === "string" ? body.timeZone : undefined;

  // Bug fix: everything from here down used to run partly outside this
  // route's own try/catch (only the engine call + save were guarded). Any
  // exception thrown by one of the earlier awaits below -- a Supabase
  // hiccup, a transient timeout -- escaped as a raw framework error page
  // instead of this route's clean JSON `{ error }` shape. The client's
  // `res.json()` then throws parsing that non-JSON body, which (see
  // weekly-session/page.tsx's own fix) used to be swallowed silently: no
  // reply, no visible error, chat just stops responding. Wrapping the
  // whole handler body closes that gap from this side too.
  try {
    // Day 7 redesign: roles/goals no longer come from /onboarding -- the
    // weekly-session page runs that conversation itself (Stage 0) the first
    // time a user gets here with no row yet, and only calls this route once
    // that's saved. This guard is now a safety net against a client that
    // skipped straight here, not the expected first-run path.
    const onboarding = await getOnboardingAnswers(supabase, user.id);
    if (!onboarding || onboarding.roles.length === 0) {
      return NextResponse.json(
        { error: "No roles on file yet. Start at /weekly-session to set them up first." },
        { status: 400 },
      );
    }

    const weekStart = planningWeekStart(new Date(), timeZone);
    const weekStartDate = planningWeekStartDate(new Date(), timeZone);
    const weekLabel = formatPlanningWeekRange(weekStartDate, timeZone);
    const transcript = await getWeeklySessionTranscript(supabase, user.id, weekStart);
    const expectedRoundSeq = transcript?.round_seq ?? 0;
    const firstUserMessage = isFirstWeeklySessionUserMessage(transcript?.display_turns);

    // Day 16: once this week's first full session has been confirmed, every
    // later message in the same chat is a lightweight mid-week addition, not
    // a restart of Accountability/Goal Setting -- see WeeklySessionMode and
    // recordWeeklySessionConfirmed (called from /confirm).
    const mode: WeeklySessionMode = transcript?.completed_at ? "addendum" : "full";
    const engineState = transcript?.active_state ?? null;

    // Day 11 rate limiting -- see src/lib/weeklySession/throttle.ts for why
    // both guards exist. Turn cap is scoped to the current *round* now
    // (active_state resets on every confirm), which is more generous than
    // before for a real multi-role full session and correctly gives every
    // addendum round its own budget rather than sharing one across the week.
    const turnCount = engineState?.turns.length ?? 0;
    if (hasHitTurnCap(turnCount)) {
      return NextResponse.json({ error: TURN_CAP_MESSAGE }, { status: 429 });
    }

    const isFreshStart = turnCount === 0;
    // The once-a-day throttle only guards *starting a brand-new full
    // session* -- the scripted-abuse case it was built for on Day 11. It
    // deliberately does not gate starting a new addendum round: the whole
    // point of Day 16 is letting the user come back and plan something else
    // the moment it comes up, possibly more than once in a day.
    if (isFreshStart && mode === "full") {
      const alreadyStartedToday = await hasStartedSessionToday(supabase, user.id);
      if (alreadyStartedToday) {
        return NextResponse.json({ error: SESSION_THROTTLE_MESSAGE }, { status: 429 });
      }
    }

    const lastWeek = mode === "full" ? await getLastWeekContext(supabase, user.id) : null;

    // Bug fix: load this week's real Google Calendar into the engine's
    // context every turn (both "full" and "addendum" -- a mid-week addition
    // is exactly when "do I have room for this?" comes up too), same
    // fresh-every-turn pattern as `lastWeek` above. Degrades to an explicit
    // "not available" string instead of failing the turn -- a user who
    // hasn't connected Google Calendar (or whose token needs a re-auth)
    // should still be able to chat, just without calendar awareness.
    let calendarSummary: string;
    try {
      const events = await listWeekEvents(supabase, user.id, weekStartDate);
      calendarSummary = formatCalendarSummary(events.items ?? []);
    } catch (calendarError) {
      if (!(calendarError instanceof GoogleCalendarError)) throw calendarError;
      calendarSummary = CALENDAR_UNAVAILABLE_SUMMARY;
    }

    const result = await processWeeklySessionMessage({
      message: body.message,
      state: engineState,
      roles: onboarding.roles,
      lastWeek,
      mode,
      weekLabel,
      weekStart,
      // Bug fix: the engine used to re-derive `actions` from scratch every
      // turn with no memory of what was already locked in earlier this
      // round, so an item could silently flip role/type/cadence turn to
      // turn. Feeding back what's already persisted for this round closes
      // that loop.
      lockedActions: transcript?.actions_so_far ?? [],
      calendarSummary,
    });

    const trimmedMessage = body.message.trim();
    const displayTurns: DisplayTurn[] = [
      ...(transcript?.display_turns ?? []),
      ...(trimmedMessage ? [{ from: "user" as const, text: trimmedMessage }] : []),
      { from: "engine", text: result.reply },
    ];

    await saveWeeklySessionTranscript(supabase, {
      userId: user.id,
      weekStart,
      displayTurns,
      activeState: result.state,
      actionsSoFar: result.actionsSoFar,
      expectedRoundSeq,
    });

    if (isFreshStart && mode === "full") {
      // Best-effort: the user's real reply already succeeded, so a logging
      // hiccup here shouldn't fail their request -- worst case is one
      // extra start slipping through if this insert is the thing that
      // fails, which is an acceptable edge case for an MVP guard.
      await recordSessionStart(supabase, user.id).catch((err) => {
        console.error("Failed to record weekly session start:", err);
      });
    }

    if (firstUserMessage && trimmedMessage) {
      try {
        await captureServerEvent({
          distinctId: user.id,
          event: "weekly_session_started",
          properties: { weekStart, mode },
        });
      } catch (err) {
        console.error("[weekly-session/step] analytics failed:", err);
      }
    }

    return NextResponse.json({
      reply: result.reply,
      action: result.action,
      actionsSoFar: result.actionsSoFar,
      usage: result.usage,
      mode,
      weekStart,
      weekLabel,
    });
  } catch (error) {
    if (error instanceof StaleTranscriptError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    console.error("Weekly session step failed:", error);
    return NextResponse.json(
      { error: "The planning engine had trouble with that — try again." },
      { status: 502 },
    );
  }
}
