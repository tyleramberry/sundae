import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { GoogleCalendarError, createCalendarEvent } from "@/lib/google/calendar";
import {
  clearConfirmingAt,
  ConfirmInProgressError,
  createWeeklyItems,
  fingerprintProposed,
  getLastWeekContext,
  getWeeklySessionTranscript,
  recordWeeklySessionConfirmed,
  tryBeginConfirm,
  type PendingProposedAction,
} from "@/lib/weeklySession/persist";
import { planningWeekStart } from "@/lib/weeklySession/week";
import { isIncomingAction } from "@/lib/weeklySession/parseActions";
import { getOnboardingAnswers } from "@/lib/onboarding/persist";
import { computeKpisForRoles, groupItemsByRole, type KpiItem } from "@/lib/kpi/compute";
import { getSessionRecap } from "@/lib/agents/sessionRecapAgent";
import { EmailError, sendSessionRecapEmail } from "@/lib/email/sessionRecap";
import type { ProposedAction } from "@/lib/planning/blocks";
import type { Turn } from "@/lib/engine/types";
import type { SupabaseClient } from "@supabase/supabase-js";

// Best-effort session-recap send: the wins/improvements the user gave
// during this session's Accountability stage (extracted from the real
// transcript by src/lib/agents/sessionRecapAgent.ts -- never invented) plus
// real KPI numbers for the week that just closed (computed the same way
// the dashboard does, not narrated by a model). Awaited rather than fired
// detached, despite the added latency: a truly un-awaited promise risks
// being killed when a serverless function's process tears down after the
// response is sent, same reliability reasoning as recordSessionStart's
// await-with-.catch below. A failure here never changes the response --
// the user's actual plan is already written by the time this runs.
async function sendRecapBestEffort(
  supabase: SupabaseClient,
  userId: string,
  userEmail: string | undefined,
  transcript: Turn[],
): Promise<boolean> {
  if (!userEmail) return false;
  try {
    const lastWeek = await getLastWeekContext(supabase, userId);
    if (!lastWeek) return false; // first-ever session -- nothing to recap yet

    const onboarding = await getOnboardingAnswers(supabase, userId);
    // Every session now includes the reserved Personal role (see
    // withPersonalRole), so last week may well have real Personal items --
    // union with whatever roles actually show up in lastWeek.items (same
    // pattern /api/dashboard uses) rather than forcing Personal in
    // unconditionally, so a week with nothing personal doesn't get a
    // permanent "Personal 0/0" line cluttering the recap email.
    const roles = [
      ...new Set([...(onboarding?.roles ?? []), ...lastWeek.items.map((i) => i.role)]),
    ];
    const kpiItems: (KpiItem & { role: string })[] = lastWeek.items.map((i) => ({
      role: i.role,
      type: i.type,
      done: i.done,
      percent: i.percent,
    }));
    const roleKpis = computeKpisForRoles(roles, groupItemsByRole(kpiItems));

    const recap = await getSessionRecap(transcript);

    await sendSessionRecapEmail({
      to: userEmail,
      weekStart: lastWeek.weekStart,
      recap,
      roleKpis,
    });
    return true;
  } catch (error) {
    const message = error instanceof EmailError || error instanceof Error ? error.message : String(error);
    console.error("Session-recap email failed (plan was still written):", message);
    return false;
  }
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

  const weekStart = planningWeekStart();
  const fingerprint = fingerprintProposed(proposed as PendingProposedAction[]);
  let wroteAnyEvent = false;
  let calendarWarning: string | null = null;

  try {
    const begin = await tryBeginConfirm(supabase, user.id, weekStart, fingerprint);
    if (begin === "duplicate") {
      return NextResponse.json({ ok: true, itemsCreated: 0, recapEmailSent: false, alreadyConfirmed: true });
    }

    const withEventIds: (ProposedAction & { eventIds: string[] })[] = [];

    for (const action of proposed as PendingProposedAction[]) {
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
        try {
          const event = await createCalendarEvent(supabase, user.id, {
            summary: action.description,
            description: `Sundae ${action.type} — ${action.role}`,
            start,
            end,
          });
          eventIds.push(event.id);
          wroteAnyEvent = true;
        } catch (error) {
          if (error instanceof GoogleCalendarError) {
            calendarWarning = error.message;
            continue;
          }
          throw error;
        }
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

    const priorTranscript = await getWeeklySessionTranscript(supabase, user.id, weekStart);
    const roundTurns: Turn[] = priorTranscript?.active_state.turns ?? [];

    // Bug fix: this used to only distinguish "a Google write actually threw
    // (calendarWarning set)" from "everything's fine" -- but a Habit/Goal
    // action can end up with zero eventIds without ever throwing, if
    // /propose simply never found a free block for it (empty
    // action.blocks, so the createCalendarEvent loop above never even ran).
    // createWeeklyItems still persists a row for it either way (so nothing
    // in the user's plan gets silently dropped), which meant `created` was
    // never 0 and the message defaulted to the success line -- "written to
    // your calendar" -- even when NONE of the items had actually landed on
    // Google Calendar. Count anything that isn't a Project and ended up
    // with no real calendar event, regardless of which of those two ways
    // it happened, and say so honestly.
    const unplacedCount = withEventIds.filter(
      (a) => a.type !== "project" && a.eventIds.length === 0,
    ).length;

    const confirmationMessage = ((): string => {
      const savedLine = `${created} item${created === 1 ? "" : "s"} saved to this week's plan.`;
      if (calendarWarning) {
        return `${savedLine} Calendar write failed: ${calendarWarning}`;
      }
      if (unplacedCount > 0) {
        return `${savedLine} ${unplacedCount} of ${created} didn't get a real time on your calendar -- no free gap was found this week. Check the plan panel and try replanning those, or free up some time and confirm again.`;
      }
      return `${created} item${created === 1 ? "" : "s"} written to your calendar.`;
    })();
    const { isFirstConfirmThisWeek } = await recordWeeklySessionConfirmed(supabase, {
      userId: user.id,
      weekStart,
      confirmationMessage,
      fingerprint,
    });

    // The plan is written -- everything after this point is a nice-to-have
    // on top of an already-successful confirm, so its own failure must
    // never surface as an error to the user (see sendRecapBestEffort).
    // Recap email is themed around "how did last week go" -- only the
    // week's first confirm (the real full session) is the right moment for
    // it; a mid-week addendum confirm skips it entirely.
    const recapEmailSent = isFirstConfirmThisWeek
      ? await sendRecapBestEffort(supabase, user.id, user.email, roundTurns)
      : false;

    return NextResponse.json({
      ok: true,
      itemsCreated: created,
      recapEmailSent,
      calendarWarning: calendarWarning ?? undefined,
      unplacedCount,
      // Bug fix: the client used to rebuild its own version of this string
      // from itemsCreated/calendarWarning instead of using this one -- two
      // independently-maintained copies of the same message, drifting the
      // moment one of them changes (which is exactly what happened: this
      // one gained the "no free gap found" case above, the client's copy
      // didn't). Sending the already-correct message once means there's
      // only one place this wording lives.
      message: confirmationMessage,
    });
  } catch (error) {
    if (error instanceof ConfirmInProgressError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    if (wroteAnyEvent) {
      return NextResponse.json(
        {
          error:
            "Some events were already written to Google Calendar. Check the calendar — don't confirm this plan again.",
          partialWrite: true,
        },
        { status: 409 },
      );
    }
    await clearConfirmingAt(supabase, user.id, weekStart).catch((err) => {
      console.error("Failed to release confirm lock after confirm error:", err);
    });
    throw error;
  }
}
