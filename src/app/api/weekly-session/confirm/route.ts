import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { GoogleCalendarError, createCalendarEvent } from "@/lib/google/calendar";
import {
  createWeeklyItems,
  currentWeekStart,
  getLastWeekContext,
  getWeeklySessionTranscript,
  recordWeeklySessionConfirmed,
} from "@/lib/weeklySession/persist";
import { getOnboardingAnswers } from "@/lib/onboarding/persist";
import { computeKpisForRoles, groupItemsByRole, type KpiItem } from "@/lib/kpi/compute";
import { getSessionRecap } from "@/lib/agents/sessionRecapAgent";
import { EmailError, sendSessionRecapEmail } from "@/lib/email/sessionRecap";
import type { ProposedAction } from "@/lib/planning/blocks";
import type { Turn } from "@/lib/engine/types";
import type { SupabaseClient } from "@supabase/supabase-js";

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

  const weekStart = currentWeekStart();

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

    // Day 16: mark this round confirmed -- resets active_state so the next
    // message starts a fresh, scoped addendum round instead of replaying
    // this whole round back into Claude (see recordWeeklySessionConfirmed
    // and the migration's header comment). Read the round's transcript
    // *before* this call, since it resets active_state as a side effect --
    // that transcript is also the source for the recap email below, so the
    // server no longer trusts a client-supplied transcript for it.
    const priorTranscript = await getWeeklySessionTranscript(supabase, user.id, weekStart);
    const roundTurns: Turn[] = priorTranscript?.active_state.turns ?? [];

    const confirmationMessage = `${created} item${created === 1 ? "" : "s"} written to your calendar.`;
    const { isFirstConfirmThisWeek } = await recordWeeklySessionConfirmed(supabase, {
      userId: user.id,
      weekStart,
      confirmationMessage,
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

    return NextResponse.json({ ok: true, itemsCreated: created, recapEmailSent });
  } catch (error) {
    if (error instanceof GoogleCalendarError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}
