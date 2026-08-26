"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { ClassifiedAction, ConversationState } from "@/lib/engine/weeklySessionTypes";
import { withPersonalRole } from "@/lib/engine/weeklySessionTypes";
import type { RoleAnswer } from "@/lib/engine/types";
import WeeklyPlanPanel from "@/components/WeeklyPlanPanel";
import WeekCalendarGrid, {
  type CalendarEvent,
  type ProposedBlock as CalendarProposedBlock,
} from "@/components/WeekCalendarGrid";
import { ChatBubble, TypingDots, turnMeta } from "@/components/weekly-session/ChatBits";
import { RolesSetupScreen } from "@/components/weekly-session/RolesSetupScreen";
import { parseDateOnly } from "@/lib/weeklySession/week";

type Turn = { from: "engine" | "user"; text: string };

type ProposedBlock = { start: string; end: string; conflictsWith?: string };
type ProposedAction = {
  role: string;
  description: string;
  type: "habit" | "goal" | "project";
  blocks: ProposedBlock[];
};

type Stage =
  | "checking"
  | "signed-out"
  | "roles-setup"
  | "chatting"
  | "proposing"
  | "confirming"
  | "writing"
  // Terminal payoff screen after a successful calendar write -- read-only
  // week view of the blocks just written, one CTA to close and start the
  // week. Not a "dead-end" screen in the Day-16 sense: the user leaves
  // via /dashboard, and returning to /weekly-session lands them in
  // "chatting" with weekConfirmed=true (transcript.completedThisWeek is
  // now server-side true), so the mid-week addendum chat still works.
  | "written";

// Real weekly-session UI. Accountability -> Goal Setting -> Planning,
// driven by src/lib/engine/weeklySession.ts, then a confirmation screen
// before anything gets written to Google Calendar + weekly_items, per the
// MVP spec's "read -> propose -> confirm -> write" permissions model.
//
// Split view (added the same day as this note): the "chatting" and
// "confirming" stages render as two columns -- conversation on the left,
// a live audit-trail panel on the right that fills in as the engine
// classifies each action item (see WeeklyPlanPanel.tsx). Once /propose
// runs, that panel swaps to WeekCalendarGrid, which overlays Sundae's
// proposed blocks on top of the user's real Google Calendar so nothing
// gets confirmed sight-unseen.
//
// Full-width stages (roles-setup, checking, signed-out) skip the split --
// there's nothing to render on the right until roles + actions exist.
//
// Day 7 redesign added a "roles-setup" stage in front of the real session:
// onboarding is now a survey/demo/hype flow with no functional data
// capture of its own, so the first time a user lands here with no
// `onboarding_answers` row yet, this page runs the roles/goals
// conversation itself (same engine, same /api/engine/step route, same
// persistence) before handing off into Stage 1-3 of the real weekly
// session. Every session after the first skips straight to "chatting"
// since the row already exists.
//
// The confirm screen is no longer take-it-or-leave-it: the user can talk
// to Sundae about the proposed plan (/api/weekly-session/revise) and the
// blocks re-propose in place.
//
// Day 16: the chat persists and stays active. The server (not this
// component) now owns the conversation -- /api/weekly-session/step reads
// and writes weekly_session_transcripts on every turn, keyed to the
// current week, so a page reload resumes exactly where the user left off
// through Sunday night (see that table's migration for why no separate
// expiry logic is needed). There's no more terminal "done" screen: once
// /confirm writes a plan, this page drops straight back into "chatting"
// with `weekConfirmed` set, and the *same* chat keeps taking messages --
// each one now runs the engine's lightweight "addendum" mode (see
// WeeklySessionMode) instead of the full Accountability/Goal-Setting arc,
// so something that comes up mid-week goes through the same
// drill-down -> propose -> confirm pipeline without restarting the week.

// Bug fix: every server-side "8am-8pm working hours" / "which week is
// this" / preferred-clock-time computation used to trust the SERVER's own
// timezone (UTC on Vercel), not the user's -- see
// src/lib/planning/blocks.ts's DEFAULT_TIME_ZONE comment for the exact
// mechanism and a production repro (blocks landing at 2am for a Denver
// user). The browser always knows its own real IANA zone; this is called
// fresh inside each request handler below (never hoisted to module scope,
// which could evaluate during server-side rendering and capture the
// server's zone instead) and sent to every route that does scheduling math.
function browserTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

// Spec #2 (2026-08-24): derive approximate calendar blocks from the
// engine's already-classified `actionsSoFar` so the calendar can fill in
// live during the chat -- watching the week take shape instead of only
// seeing a wall of blocks at session end. These are hints, not
// commitments: the real proposal comes from /api/weekly-session/propose,
// which does collision-aware slotting, and its output visually replaces
// these draft blocks the moment /propose runs.
//
// Honesty rules (never invent data):
//   - Project actions have no calendar time -- skipped.
//   - Item needs BOTH weekday (0-6) AND preferredTime ("HH:MM") to render.
//     Missing either = shown only in the Plan panel, never guessed onto
//     the grid.
//   - If the engine captured a recurrence pattern, expand it:
//       * "daily" -> one block on every day of the week
//       * "weekdays" -> Mon-Fri
//       * "weekly" with days -> one block per named day
//     Otherwise a single block on the single `weekday` the classifier
//     already resolved (even for a cadenceCount > 1 habit with no named
//     days -- extra occurrences would be fabricated).
const RECURRENCE_DAY_INDEX: Record<string, number> = {
  SU: 0,
  MO: 1,
  TU: 2,
  WE: 3,
  TH: 4,
  FR: 5,
  SA: 6,
};

function buildDraftBlocks(
  actions: ClassifiedAction[],
  weekStart: Date | null,
): CalendarProposedBlock[] {
  if (!weekStart) return [];
  const blocks: CalendarProposedBlock[] = [];
  for (const action of actions) {
    if (action.type === "project") continue;
    if (typeof action.weekday !== "number" || !action.preferredTime) continue;
    const m = /^([0-1]?\d|2[0-3]):([0-5]\d)$/.exec(action.preferredTime.trim());
    if (!m) continue;
    const hh = Number(m[1]);
    const mm = Number(m[2]);
    const duration = action.durationMinutes ?? 60;

    const dayIndices: number[] = (() => {
      const r = action.recurrence;
      if (!r) return [action.weekday];
      if (r.pattern === "daily") return [0, 1, 2, 3, 4, 5, 6];
      if (r.pattern === "weekdays") return [1, 2, 3, 4, 5];
      if (r.pattern === "weekly" && r.days && r.days.length > 0) {
        return r.days
          .map((d) => RECURRENCE_DAY_INDEX[d])
          .filter((idx): idx is number => typeof idx === "number");
      }
      return [action.weekday];
    })();

    for (const dayIdx of dayIndices) {
      const start = new Date(weekStart);
      start.setDate(start.getDate() + dayIdx);
      start.setHours(hh, mm, 0, 0);
      const end = new Date(start.getTime() + duration * 60_000);
      blocks.push({
        role: action.role,
        description: action.description,
        start: start.toISOString(),
        end: end.toISOString(),
      });
    }
  }
  return blocks;
}

export default function WeeklySessionPage() {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>("checking");

  const [state, setState] = useState<ConversationState | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fixed role list from onboarding_answers, in the exact order the session
  // will run them. Powers the audit-trail panel's grouping, so it stays
  // available across every turn even before the engine has classified
  // anything under a given role yet.
  const [roles, setRoles] = useState<string[]>([]);

  // Grows turn-by-turn as the engine classifies each Habit/Goal/Project --
  // exposed on every /api/weekly-session/step response as `actionsSoFar`
  // (see WeeklySessionOutput). Feeds the right-side panel while the chat
  // is still going; when the session completes, becomes `sessionActions`
  // for the confirm/revise flow.
  const [actionsSoFar, setActionsSoFar] = useState<ClassifiedAction[]>([]);
  const [committedActions, setCommittedActions] = useState<ClassifiedAction[]>([]);

  // The engine's classified actions from the completed session -- kept so
  // the confirm screen can re-propose after a revision without re-running
  // the whole conversation.
  const [sessionActions, setSessionActions] = useState<ClassifiedAction[]>([]);
  const [proposed, setProposed] = useState<ProposedAction[] | null>(null);

  // Day 16: true once this week's plan has been confirmed at least once --
  // flips the chat from "the one and only weekly session" into "still open
  // for whatever comes up mid-week" (addendum mode server-side). Hydrated
  // from GET /api/weekly-session/transcript on mount, and set locally the
  // moment a confirm succeeds so the UI doesn't wait on a round-trip.
  const [weekConfirmed, setWeekConfirmed] = useState(false);

  // Snapshot of what was just written to Google Calendar -- captured on
  // confirm() success so the "written"-stage payoff screen can render a
  // read-only week view of the exact blocks that landed, without depending
  // on `proposed`/`sessionActions` which are cleared as part of the same
  // handler. Cleared when the user leaves via the payoff CTA.
  const [writtenProposed, setWrittenProposed] = useState<ProposedAction[] | null>(null);
  const [writtenSummary, setWrittenSummary] = useState<{
    itemsCreated: number;
    recapEmailSent: boolean;
    unplacedCount: number;
    overlappingCount: number;
    alreadyConfirmed: boolean;
  } | null>(null);
  const [referralCopied, setReferralCopied] = useState(false);
  // Tracks the "copied ✓" auto-clear timer so a mid-copy navigation
  // (user hits "Close and start your week" within 2.5s) doesn't leave a
  // stale timeout firing setState after unmount. Cleared both in onClose
  // and when a new copy overrides the previous one.
  const referralCopiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Real Google Calendar events for this week -- powers the WeekCalendarGrid
  // background layer, so proposed blocks show up on top of what's actually
  // scheduled rather than a blank grid. Fetched once when the chat begins
  // (so the grid renders instantly the moment the session completes),
  // refreshed after /confirm writes new events.
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
  const [weekStart, setWeekStart] = useState<Date | null>(null);
  const [weekLabel, setWeekLabel] = useState<string>("");

  // Mobile-only toggle to reveal the audit-trail / calendar panel over the
  // chat -- the two-column split doesn't fit under ~600px, same call the
  // AppSidebar makes to collapse into a top bar.
  const [mobilePanelOpen, setMobilePanelOpen] = useState(false);

  // Feature: "toggle between the planned task ... and a calendar view ...
  // rendered at the beginning of the chat, updating as you go" -- during
  // "chatting" the right panel used to only ever show the plan-so-far
  // audit trail; the real calendar (already fetched on load, see
  // loadCalendarEvents below) had nowhere to show until /propose ran.
  // This is chatting-stage only -- proposing/confirming/writing already
  // show the calendar grid unconditionally (with the proposed overlay).
  const [chatPanelView, setChatPanelView] = useState<"plan" | "calendar">("plan");

  // Confirm-screen revision chat.
  const [reviseTurns, setReviseTurns] = useState<Turn[]>([]);
  const [reviseInput, setReviseInput] = useState("");
  const [revising, setRevising] = useState(false);

  const chatInputRef = useRef<HTMLInputElement>(null);
  const reviseInputRef = useRef<HTMLInputElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const didInit = useRef(false);
  const confirmInFlight = useRef(false);

  // Draggable chat/calendar divider (desktop only). The old fixed 420px chat
  // column matched what Notion/Linear do, but Tyler asked for a hover-and-
  // drag adjust so the split follows whatever he's doing on the day -- more
  // chat when the session is heavy, more calendar when he's scanning the
  // week. Bounds are wide enough to be useful (chat still fits a paragraph
  // at 320px; calendar still fits a full-week grid at the max), stored in
  // localStorage so his preferred split survives navigations.
  const SPLIT_MIN_PX = 320;
  const SPLIT_MAX_PX = 720;
  const SPLIT_DEFAULT_PX = 420;
  const SPLIT_STORAGE_KEY = "sundae:weekly-session:splitLeftPx";
  const [splitLeftPx, setSplitLeftPx] = useState<number>(SPLIT_DEFAULT_PX);
  const [isDesktopSplit, setIsDesktopSplit] = useState(false);
  const dragStateRef = useRef<{ startX: number; startWidth: number; latest: number } | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    // Load persisted split width once on mount, then subscribe to the md
    // breakpoint. Both setState calls run inside media/storage callbacks
    // rather than in the effect body -- the lint rule flags synchronous
    // setState during effect setup (it causes an extra render pass), so we
    // schedule the storage read on a microtask.
    const applyStoredSplit = () => {
      try {
        const stored = window.localStorage.getItem(SPLIT_STORAGE_KEY);
        if (stored === null) return;
        const n = Number(stored);
        if (Number.isFinite(n) && n >= SPLIT_MIN_PX && n <= SPLIT_MAX_PX) {
          setSplitLeftPx(n);
        }
      } catch {
        // Safari private mode throws on localStorage access -- default
        // width is a fine fallback.
      }
    };
    queueMicrotask(applyStoredSplit);

    const mq = window.matchMedia("(min-width: 768px)");
    const sync = () => setIsDesktopSplit(mq.matches);
    queueMicrotask(sync);
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  function onDividerPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (!isDesktopSplit) return;
    e.preventDefault();
    (e.currentTarget as HTMLDivElement).setPointerCapture?.(e.pointerId);
    dragStateRef.current = {
      startX: e.clientX,
      startWidth: splitLeftPx,
      latest: splitLeftPx,
    };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    const onMove = (ev: PointerEvent) => {
      const s = dragStateRef.current;
      if (!s) return;
      const next = Math.max(
        SPLIT_MIN_PX,
        Math.min(SPLIT_MAX_PX, s.startWidth + (ev.clientX - s.startX)),
      );
      s.latest = next;
      setSplitLeftPx(next);
    };
    const onUp = () => {
      const s = dragStateRef.current;
      dragStateRef.current = null;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      if (s) {
        try {
          window.localStorage.setItem(SPLIT_STORAGE_KEY, String(s.latest));
        } catch {
          // localStorage is best-effort persistence -- the state stays in
          // memory even if we can't write.
        }
      }
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  }

  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;

    void (async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setStage("signed-out");
        router.replace("/login?next=/weekly-session");
        return;
      }

      const res = await fetch("/api/onboarding/complete");
      const body = await res.json().catch(() => ({}));
      const hasRoles = res.ok && body.answers && body.answers.roles?.length > 0;

      if (hasRoles) {
        setRoles(body.answers.roles ?? []);
        setStage("chatting");
        const transcriptRes = await fetch("/api/weekly-session/transcript");
        const transcriptBody = await transcriptRes.json().catch(() => ({}));
        applyWeekMeta(transcriptBody);
        const transcript = transcriptRes.ok ? transcriptBody.transcript : null;
        if (Array.isArray(transcriptBody.committedActions)) {
          setCommittedActions(transcriptBody.committedActions);
        }
        const weekDate = parseWeekStart(transcriptBody.weekStart);
        void loadCalendarEvents(weekDate);

        if (transcript && transcript.displayTurns?.length > 0) {
          setTurns(transcript.displayTurns);
          setActionsSoFar(transcript.actionsSoFar ?? []);
          setWeekConfirmed(Boolean(transcript.completedThisWeek));
          if (Array.isArray(transcript.pendingProposed) && transcript.pendingProposed.length > 0) {
            setProposed(transcript.pendingProposed);
            setSessionActions(transcript.pendingSessionActions ?? []);
            setStage("confirming");
          }
        } else {
          void send("");
        }
      } else {
        setStage("roles-setup");
        void sendRoles("");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the caret in the chat box: it gets disabled (and loses focus) while
  // a turn is in flight, so refocus once the reply lands or the stage opens.
  useEffect(() => {
    if (!sending && (stage === "chatting" || stage === "roles-setup")) {
      chatInputRef.current?.focus();
    }
  }, [sending, stage]);

  useEffect(() => {
    if (!revising && stage === "confirming") {
      reviseInputRef.current?.focus();
    }
  }, [revising, stage]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns, sending, reviseTurns, revising, stage]);

  function parseWeekStart(iso: unknown): Date | null {
    return typeof iso === "string" ? parseDateOnly(iso) : null;
  }

  function applyWeekMeta(body: { weekStart?: unknown; weekLabel?: unknown }) {
    if (typeof body.weekLabel === "string" && body.weekLabel) {
      setWeekLabel(body.weekLabel);
    }
    const d = parseWeekStart(body.weekStart);
    if (d) setWeekStart(d);
  }

  function mergePlan(committed: ClassifiedAction[], round: ClassifiedAction[]): ClassifiedAction[] {
    const seen = new Set(committed.map((a) => `${a.role}|${a.description}`));
    return [...committed, ...round.filter((a) => !seen.has(`${a.role}|${a.description}`))];
  }

  function looksStalled(reply: string): boolean {
    return reply.trim().length > 0 && !reply.includes("?");
  }

  async function loadCalendarEvents(start?: Date | null) {
    try {
      const d = start ?? weekStart;
      const q = d
        ? `?weekStart=${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
        : "";
      const res = await fetch(`/api/calendar/events${q}`);
      if (!res.ok) return;
      const body = await res.json();
      setCalendarEvents((body.items ?? []) as CalendarEvent[]);
    } catch {
      // Silent, per above.
    }
  }

  // Stage 0: roles/goals, only for a user's first-ever session. Identical
  // wire protocol to the old /onboarding page's chat -- same engine
  // (src/lib/engine/engine.ts), same /api/engine/step route.
  async function sendRoles(message: string) {
    if (message) {
      setTurns((t) => [...t, { from: "user" as const, text: message }]);
    }
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/engine/step", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, state }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "Something went wrong. Try again.");
        return;
      }
      setTurns((t) => [...t, { from: "engine" as const, text: body.reply }]);
      setState(body.state);

      if (body.action?.type === "complete") {
        await finishRolesSetup(body.action.roles, body.action.answers);
      }
    } catch {
      // Bug fix: a thrown fetch (network drop) or a res.json() parse
      // failure (a non-JSON error page from an upstream crash/timeout) used
      // to propagate past this function uncaught -- `finally` below still
      // reset `sending`, so the input looked idle again, but the user got
      // no reply and no error: the chat just silently stopped responding.
      setError("Sundae lost the connection there — try sending that again.");
    } finally {
      setSending(false);
    }
  }

  async function finishRolesSetup(rolesFromEngine: string[], answers: RoleAnswer[]) {
    setSending(true);
    try {
      const res = await fetch("/api/onboarding/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roles: rolesFromEngine, answers }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Couldn't save your roles — try confirming again.");
        return;
      }
      // Clean handoff into the real session: fresh transcript, one short
      // bridging line so the switch from "roles" to "planning" doesn't
      // feel like a hard cut. No engine state to reset here anymore (Day
      // 16) -- the weekly-session engine's conversation lives server-side
      // in weekly_session_transcripts, not in this component, and a
      // brand-new user has no row yet, so send("") below starts fresh.
      setTurns([{ from: "engine", text: "Roles are set. Let's plan your week." }]);
      setRoles(rolesFromEngine);
      setStage("chatting");
      void loadCalendarEvents(weekStart);
      void send("");
    } catch {
      setError("Lost the connection saving your roles — try again.");
    } finally {
      setSending(false);
    }
  }

  // Day 16: the server owns the weekly-session conversation (see
  // /api/weekly-session/step) -- this just sends the user's message and
  // renders whatever comes back. No client-side ConversationState
  // round-trip anymore, which also removes the stale-closure hazard the
  // old roles->planning handoff used to need an explicit workaround for.
  async function send(message: string, opts?: { autoContinue?: boolean }) {
    if (message) {
      setTurns((t) => [...t, { from: "user" as const, text: message }]);
    }
    setSending(true);
    setError(null);
    let continueToNextRole = false;
    try {
      const res = await fetch("/api/weekly-session/step", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, timeZone: browserTimeZone() }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "Something went wrong. Try again.");
        return;
      }
      applyWeekMeta(body);
      setTurns((t) => [...t, { from: "engine" as const, text: body.reply }]);

      // Keep the audit-trail panel current with whatever the engine has
      // classified so far this round -- even before the round is
      // complete, so the user sees each new item land as it happens.
      if (Array.isArray(body.actionsSoFar)) {
        setActionsSoFar(body.actionsSoFar as ClassifiedAction[]);
      }

      if (body.action?.type === "complete") {
        await propose(body.action.actions);
      } else if (
        !opts?.autoContinue &&
        !weekConfirmed &&
        typeof body.reply === "string" &&
        looksStalled(body.reply)
      ) {
        continueToNextRole = true;
      }
    } catch {
      // Bug fix (the "chat just stopped responding" report): this fetch had
      // no catch at all before. A network drop, or a non-JSON error page
      // from an upstream crash/timeout tripping up res.json(), threw here
      // and escaped uncaught -- `finally` still flipped `sending` back to
      // false so the compose box re-enabled, but no reply and no error ever
      // appeared, and it silently repeated on every message after. Now it
      // surfaces and the user can just retry.
      setError("Sundae lost the connection there — try sending that again.");
    } finally {
      if (!continueToNextRole) setSending(false);
    }
    if (continueToNextRole) {
      void send("Please continue to the next role.", { autoContinue: true });
    }
  }

  // Turns a classified action list into proposed calendar blocks. Shared by
  // the initial propose (session complete) and every in-place re-propose
  // after a revision, so scheduling always runs the same route.
  async function fetchProposed(actions: ClassifiedAction[]): Promise<ProposedAction[] | null> {
    // Bug fix: this had no try/catch at all -- a thrown fetch/parse error
    // propagated straight up to propose()/sendRevision(), which also had no
    // catch, so it kept going until it hit send()'s try (now caught, see
    // above) while `stage` was stuck on "proposing" the whole time (the
    // spinner that never resolves). Catching here and returning null lets
    // the existing null-handling in propose()/sendRevision() reset the
    // stage the same way an ordinary !res.ok failure already does.
    try {
      const res = await fetch("/api/weekly-session/propose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actions, timeZone: browserTimeZone() }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "Couldn't propose calendar blocks — your answers aren't lost.");
        return null;
      }
      applyWeekMeta(body);
      return body.proposed as ProposedAction[];
    } catch {
      setError("Lost the connection proposing calendar blocks — your answers aren't lost, try again.");
      return null;
    }
  }

  async function propose(actions: ClassifiedAction[]) {
    setSessionActions(actions);
    setStage("proposing");
    const p = await fetchProposed(actions);
    if (!p) {
      setStage("chatting");
      return;
    }
    setProposed(p);
    setStage("confirming");
  }

  // Flatten the confirm-screen's per-action list into the flat block list
  // the calendar grid expects. Runs during "confirming"/"writing", so
  // Sundae's proposed blocks appear overlaid on real events for approval.
  function flattenProposedForGrid(): CalendarProposedBlock[] {
    if (!proposed) return [];
    const flat: CalendarProposedBlock[] = [];
    for (const action of proposed) {
      for (const block of action.blocks) {
        flat.push({
          role: action.role,
          description: action.description,
          start: block.start,
          end: block.end,
          conflictsWith: block.conflictsWith,
        });
      }
    }
    return flat;
  }

  // Confirm-screen revision: send the change to Sundae, take the revised
  // action list back, and re-slot blocks in place -- no calendar write, and
  // we stay on the confirm screen the whole time.
  async function sendRevision(message: string) {
    setReviseTurns((t) => [...t, { from: "user" as const, text: message }]);
    setRevising(true);
    setError(null);
    try {
      const res = await fetch("/api/weekly-session/revise", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actions: sessionActions, message }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "Couldn't apply that change — try rewording it.");
        return;
      }
      setReviseTurns((t) => [...t, { from: "engine" as const, text: body.reply }]);
      setSessionActions(body.actions);
      // Keep the audit-trail panel current with the revised classification
      // too -- the panel is technically hidden during "confirming" (grid
      // takes over), but we set it anyway so if the user navigates back
      // during proposing, they see the latest list.
      setActionsSoFar(body.actions);
      const p = await fetchProposed(body.actions);
      if (p) setProposed(p);
    } catch {
      setError("Lost the connection there — try that revision again.");
    } finally {
      setRevising(false);
    }
  }

  // Placement redesign (see blocks.ts's file header + the user's own
  // framing: "if Sundae knows it's gonna overlap an existing event, do
  // not change it -- tell the user, are you sure, and if they say yes,
  // write it on top"). /propose no longer avoids a busy slot; it flags
  // it with `conflictsWith` instead. This is where that gets asked --
  // once, summarizing every conflict, right before the actual write.
  function describeConflicts(): string[] {
    if (!proposed) return [];
    const lines: string[] = [];
    for (const action of proposed) {
      for (const block of action.blocks) {
        if (block.conflictsWith) {
          lines.push(`${action.role} · ${action.description} — overlaps ${block.conflictsWith}`);
        }
      }
    }
    return lines;
  }

  async function confirm() {
    if (!proposed || confirmInFlight.current) return;
    const conflicts = describeConflicts();
    if (
      conflicts.length > 0 &&
      !window.confirm(
        `${conflicts.length} item${conflicts.length === 1 ? "" : "s"} overlap${conflicts.length === 1 ? "s" : ""} something already on your calendar:\n\n${conflicts.join("\n")}\n\nWrite them anyway?`,
      )
    ) {
      return;
    }
    confirmInFlight.current = true;
    setStage("writing");
    setError(null);
    try {
    // No transcript in the body anymore (Day 16) -- the confirm route
    // reads this round's transcript itself from weekly_session_transcripts,
    // since the server is now the source of truth for it too.
    const res = await fetch("/api/weekly-session/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ proposed, timeZone: browserTimeZone() }),
    });
    const body = await res.json();
    if (!res.ok) {
      if (body.partialWrite) {
        setError(body.error ?? "Some events were already written. Check your calendar — don't confirm again.");
        setStage("confirming");
        return;
      }
      setError(body.error ?? "Couldn't write to your calendar.");
      setStage("confirming");
      return;
    }
    // Design upgrade #4: a dedicated payoff screen after the write, instead
    // of the Day-16 drop-straight-back-into-chat. The chat still owns the
    // mid-week addendum flow -- the user returns to it via /dashboard, and
    // /weekly-session then lands in "chatting" with weekConfirmed=true
    // because transcript.completedThisWeek is server-side true. The server's
    // `message` and the recap-sent detail move onto the payoff screen so
    // nothing the user needed from the old confirmation bubbles goes
    // missing.
    setWrittenProposed(proposed);
    setWrittenSummary({
      itemsCreated: Number(body.itemsCreated ?? 0),
      recapEmailSent: Boolean(body.recapEmailSent),
      unplacedCount: Number(body.unplacedCount ?? 0),
      overlappingCount: Number(body.overlappingCount ?? 0),
      alreadyConfirmed: Boolean(body.alreadyConfirmed),
    });
    setWeekConfirmed(true);
    setCommittedActions((prev) => mergePlan(prev, sessionActions));
    setActionsSoFar([]);
    setSessionActions([]);
    setProposed(null);
    setReviseTurns([]);
    void loadCalendarEvents(weekStart);
    setStage("written");
    } catch {
      // Bug fix: same missing-catch class as send()/fetchProposed() above,
      // just higher stakes here since this is the actual calendar write --
      // must not leave `stage` stuck on "writing" with no way to tell
      // whether it went through.
      setError(
        "Lost the connection while writing to your calendar — check your calendar before confirming again.",
      );
      setStage("confirming");
    } finally {
      confirmInFlight.current = false;
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || sending) return;
    const message = input;
    setInput("");
    if (stage === "roles-setup") {
      void sendRoles(message);
    } else {
      void send(message);
    }
  }

  function handleReviseSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!reviseInput.trim() || revising) return;
    const message = reviseInput;
    setReviseInput("");
    void sendRevision(message);
  }

  function formatRange(block: ProposedBlock) {
    const s = new Date(block.start);
    const e = new Date(block.end);
    const day = s.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
    const time = (d: Date) => d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
    return `${day}, ${time(s)}–${time(e)}`;
  }

  // Placement redesign: a block only ever comes back empty now when the
  // exact requested time is genuinely unreachable (already passed) --
  // busy no longer means unplaced, it means `conflictsWith` (see below).
  function unplacedHint(action: ProposedAction): string {
    const classified = sessionActions.find(
      (a) => a.role === action.role && a.description === action.description,
    );
    const bits: string[] = [];
    if (classified?.preferredTime) bits.push(classified.preferredTime);
    if (bits.length > 0) {
      return `You asked for ${bits.join(" ")} — that's already passed this week. The item still saves to this week's plan; replan it for a real time.`;
    }
    return "That time has already passed this week. The item still saves to this week's plan; replan it for a real time.";
  }

  if (stage === "checking" || stage === "signed-out") {
    return (
      <div className="flex flex-1 items-center justify-center bg-zinc-50 font-sans dark:bg-black">
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Loading…</p>
      </div>
    );
  }

  // Payoff screen (spec #4): full-page confirmation moment after a
  // successful write. Runs pre-split like roles-setup -- nothing about
  // the chat/calendar split makes sense once the week is locked in. The
  // "Close and start your week" CTA is the only exit; the mid-week
  // addendum flow still works from /weekly-session on a future visit
  // (weekConfirmed=true will already be persisted server-side by then).
  if (stage === "written" && writtenProposed && writtenSummary) {
    return (
      <PayoffScreen
        proposed={writtenProposed}
        summary={writtenSummary}
        calendarEvents={calendarEvents}
        weekStart={weekStart ?? new Date()}
        weekLabel={weekLabel}
        referralCopied={referralCopied}
        onCopyReferral={async () => {
          try {
            await navigator.clipboard.writeText(window.location.origin);
            if (referralCopiedTimerRef.current) {
              clearTimeout(referralCopiedTimerRef.current);
            }
            setReferralCopied(true);
            referralCopiedTimerRef.current = setTimeout(() => {
              setReferralCopied(false);
              referralCopiedTimerRef.current = null;
            }, 2500);
          } catch {
            // Clipboard can be denied in insecure contexts or when the user
            // hasn't interacted with the doc yet -- swallow rather than
            // trip an error surface; the referral prompt is a nice-to-have
            // and we don't want a clipboard hiccup to ruin the payoff.
          }
        }}
        onClose={() => {
          if (referralCopiedTimerRef.current) {
            clearTimeout(referralCopiedTimerRef.current);
            referralCopiedTimerRef.current = null;
          }
          setWrittenProposed(null);
          setWrittenSummary(null);
          setReferralCopied(false);
          setStage("chatting");
          router.push("/dashboard");
        }}
      />
    );
  }

  // Roles-setup runs pre-split -- there's no plan or calendar to show on
  // the right until it finishes and hands off into "chatting". Same
  // full-width chat as before.
  if (stage === "roles-setup") {
    return (
      <RolesSetupScreen
        turns={turns}
        sending={sending}
        error={error}
        input={input}
        onInputChange={setInput}
        onSubmit={handleSubmit}
        chatInputRef={chatInputRef}
      />
    );
  }

  // Split view: chat on the left, live audit-trail panel (or calendar grid,
  // once /propose has run) on the right. Runs for chatting, proposing,
  // confirming, and writing -- the whole arc where either a "plan so far"
  // or a "here's what I'll put on your calendar" is worth showing.
  //
  // Two distinct "show the calendar" cases, kept separate because they
  // render differently: once /propose has run there's a real proposed
  // overlay + per-item list to show alongside the grid; during plain
  // chatting (the calendar toggle above) there's nothing proposed yet --
  // just the real calendar, so the user can see their actual week while
  // still talking, not only after the session completes.
  const showProposedCalendarPanel =
    stage === "confirming" || stage === "writing" || stage === "proposing";
  const showLiveCalendarPanel = stage === "chatting" && chatPanelView === "calendar";
  const showCalendarPanel = showProposedCalendarPanel || showLiveCalendarPanel;

  return (
    // `min-h-0` here (and again one level down on the messages wrapper)
    // is what makes the transcript scroll *inside* its own pane instead of
    // growing the whole page -- `main` upstream (see (app)/layout.tsx) is
    // already clamped to the viewport, but a flex child's default
    // `min-height: auto` still lets it expand past that unless overridden.
    // Spec #2 (2026-08-24) layout: fixed-left chat column, flex-right
    // plan/calendar. Both children used to cap at md:max-w-xl / md:max-w-2xl,
    // which left dead space on the right of wide screens. Now the chat sits
    // at 420px wide and the plan/calendar takes every remaining pixel --
    // matches how Notion/Linear/Cal.com handle a chat+workspace split, and
    // gives the calendar grid actual room to breathe.
    <div className="flex min-h-0 flex-1 flex-col bg-zinc-50 font-sans dark:bg-black md:flex-row">
      {/* LEFT: conversation. */}
      <div
        className="flex min-h-0 flex-1 flex-col overflow-hidden md:shrink-0 md:flex-none"
        style={
          isDesktopSplit
            ? { width: `${splitLeftPx}px`, flexBasis: `${splitLeftPx}px` }
            : undefined
        }
      >
        <div className="flex items-start justify-between border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
          <div>
            <span className="text-sm font-medium uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
              Sundae
            </span>
            {/* Spec #1 (2026-08-24): header stays constant across chatting /
                proposing / confirming / writing. The old "Confirm this week's
                plan" swap plus the "Nothing's on your calendar yet — review it,
                or tell Sundae what to change below" sub-line broke the
                planning-partner feel by turning the header into a form label
                mid-conversation. Sundae now asks the "want to change anything,
                or should I lock this in?" question inline as a chat bubble at
                the moment /propose returns (see PromptToLockIn below). */}
            <h1 className="mt-1 text-2xl font-semibold text-black dark:text-zinc-50">
              Weekly planning session
            </h1>
            {weekLabel && (
              <p className="mt-1 text-sm font-medium text-emerald-700 dark:text-emerald-400">
                {weekLabel}
              </p>
            )}
            {/* Day 16: this week's plan is live but the chat stays open --
                make clear the compose box below is now for whatever comes
                up mid-week, not a second full session. */}
            {stage === "chatting" && weekConfirmed && (
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                This week&apos;s plan is set. Anything else you want to plan
                for, just ask.
              </p>
            )}
            {/* Spec #2 (2026-08-24): the Plan/Calendar toggle used to live
                here in the left header, but it belongs above the right
                panel it controls -- moved down (search "PLAN / CALENDAR
                TOGGLE" below). */}
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/dashboard"
              className="hidden rounded-full border border-zinc-300 px-3 py-1.5 text-xs text-zinc-700 md:inline-block dark:border-zinc-700 dark:text-zinc-300"
            >
              Dashboard
            </Link>
            <button
              onClick={() => setMobilePanelOpen((v) => !v)}
              className="rounded-full border border-zinc-300 px-3 py-1.5 text-xs text-zinc-700 md:hidden dark:border-zinc-700 dark:text-zinc-300"
            >
              {mobilePanelOpen
                ? "Back to chat"
                : showCalendarPanel
                  ? "View calendar"
                  : "View plan so far"}
            </button>
          </div>
        </div>

        {/* Mobile: when the panel is open, hide the chat behind it. */}
        <div className={`flex min-h-0 flex-1 flex-col ${mobilePanelOpen ? "hidden md:flex" : "flex"}`}>
          <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-6 py-4">
            {error && <p className="text-sm text-red-600">{error}</p>}

            {(() => {
              // Spec #1: build a single visual transcript that flows from the
              // planning conversation into the confirm-stage revision
              // conversation without a form-style divider. The synthetic
              // "want to change anything, or should I add this to your calendar?"
              // bubble is inserted at the boundary so the stage transition
              // reads as Sundae's next turn, not a UI switch. All three
              // sources feed through the same turnMeta() so grouping / avatar
              // suppression stay coherent across the boundary.
              const showLockPrompt =
                (stage === "confirming" || stage === "writing") && !!proposed;
              const combined: Turn[] = [
                ...turns,
                ...(showLockPrompt
                  ? [
                      {
                        from: "engine" as const,
                        text: describeConflicts().length > 0
                          ? "Take a look — I've flagged a few blocks that overlap what's already on your calendar. Want to change anything, or should I add this to your calendar?"
                          : "Take a look — want to change anything, or should I add this to your calendar?",
                      },
                    ]
                  : []),
                ...(stage === "confirming" || stage === "writing" ? reviseTurns : []),
              ];
              const meta = turnMeta(combined);
              return combined.map((turn, i) => (
                <ChatBubble
                  key={i}
                  turn={turn}
                  showAvatar={meta[i].showAvatar}
                  showName={meta[i].showName}
                />
              ));
            })()}
            {(sending || revising || stage === "proposing") && <TypingDots />}
            <div ref={chatEndRef} />
          </div>

          <div className="border-t border-zinc-200 px-6 py-4 dark:border-zinc-800">
            {stage === "confirming" || stage === "writing" ? (
              // Confirm stage compose: same chat input the rest of the
              // session uses (revisions are just chat turns), plus a
              // primary "Add to calendar" pill positioned as a natural next
              // action, not a form submit. The label must be explicit that
              // confirming writes to Google Calendar (OAuth verification).
              // Sundae asked the question inline above; this is the reply.
              <div className="flex flex-col gap-3">
                <form onSubmit={handleReviseSubmit} className="flex gap-3">
                  <input
                    ref={reviseInputRef}
                    value={reviseInput}
                    onChange={(e) => setReviseInput(e.target.value)}
                    placeholder="Tell Sundae what to change…"
                    disabled={revising || stage === "writing"}
                    className="flex-1 rounded-full border border-zinc-300 bg-white px-4 py-2 text-sm text-black disabled:opacity-50 dark:border-zinc-300 dark:bg-white dark:text-black"
                  />
                  <button
                    type="submit"
                    disabled={revising || stage === "writing" || !reviseInput.trim()}
                    className="rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 transition hover:border-zinc-400 disabled:opacity-50 dark:border-zinc-300 dark:text-zinc-700"
                  >
                    Send
                  </button>
                </form>
                <button
                  onClick={confirm}
                  disabled={stage === "writing" || revising}
                  className="self-start rounded-full bg-emerald-600 px-5 py-2 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:opacity-50 dark:bg-emerald-600 dark:text-white"
                >
                  {stage === "writing" ? "Adding to calendar…" : "Add to calendar"}
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="flex gap-3">
                <input
                  ref={chatInputRef}
                  autoFocus
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={
                    weekConfirmed ? "What else is on your mind this week?" : "Talk to Sundae…"
                  }
                  disabled={sending || stage !== "chatting"}
                  className="flex-1 rounded-full border border-zinc-300 bg-white px-4 py-2 text-sm text-black disabled:opacity-50 dark:border-zinc-300 dark:bg-white dark:text-black"
                />
                <button
                  type="submit"
                  disabled={sending || stage !== "chatting" || !input.trim()}
                  className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:opacity-50 dark:bg-emerald-600 dark:text-white"
                >
                  Send
                </button>
              </form>
            )}
          </div>
        </div>
      </div>

      {/* DRAGGABLE DIVIDER (desktop only): 6px hit area with a 1px visual
          rule, expands to a wider hover state so the drag affordance is
          discoverable without adding permanent chrome. Pointer events (not
          mouse) so trackpad+touchscreen users get the same behavior; the
          handler no-ops on mobile where the split doesn't apply. */}
      <div
        onPointerDown={onDividerPointerDown}
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize chat and calendar"
        aria-valuenow={splitLeftPx}
        aria-valuemin={SPLIT_MIN_PX}
        aria-valuemax={SPLIT_MAX_PX}
        className="hidden md:flex md:w-1.5 md:cursor-col-resize md:items-stretch md:justify-center md:bg-zinc-200 md:transition-colors md:hover:bg-emerald-400 md:active:bg-emerald-500 md:dark:bg-zinc-800 md:dark:hover:bg-emerald-500"
      />

      {/* RIGHT: live audit-trail panel (during chatting) or WeekCalendarGrid
          (once /propose runs). Full-width on mobile only when toggled open;
          always visible on md+. Spec #2 (2026-08-24): the max-width cap is
          gone -- this column now takes every pixel not claimed by the
          fixed-width chat column on the left. */}
      <div
        className={`${
          mobilePanelOpen ? "flex" : "hidden"
        } min-h-0 flex-1 flex-col overflow-hidden bg-zinc-50 md:flex md:bg-white md:dark:bg-zinc-950`}
      >
        {/* PLAN / CALENDAR TOGGLE (spec #2 relocation): lives at the top of
            the right panel so it sits directly above what it controls,
            instead of buried below the chat header on the left. Chatting-
            stage only; during proposing/confirming/writing the panel is
            always the calendar with the proposal overlay -- no toggle
            needed. */}
        {stage === "chatting" && (
          <div className="flex items-center justify-end border-b border-zinc-200 bg-white px-4 py-2 dark:border-zinc-800 dark:bg-white">
            <div className="inline-flex rounded-full border border-zinc-300 p-0.5 text-xs dark:border-zinc-300">
              <button
                onClick={() => setChatPanelView("plan")}
                className={`rounded-full px-3 py-1 transition ${
                  chatPanelView === "plan"
                    ? "bg-zinc-900 text-white dark:bg-zinc-900 dark:text-white"
                    : "text-zinc-600 dark:text-zinc-600"
                }`}
              >
                Plan
              </button>
              <button
                onClick={() => setChatPanelView("calendar")}
                className={`rounded-full px-3 py-1 transition ${
                  chatPanelView === "calendar"
                    ? "bg-zinc-900 text-white dark:bg-zinc-900 dark:text-white"
                    : "text-zinc-600 dark:text-zinc-600"
                }`}
              >
                Calendar
              </button>
            </div>
          </div>
        )}
        {showLiveCalendarPanel ? (
          // Chatting-stage calendar toggle. Real events were fetched on
          // mount (see loadCalendarEvents) so this is instant. The `draft`
          // array is computed from `actionsSoFar` -- items the engine has
          // already classified with a weekday + preferredTime show up as
          // dashed sky-tinted blocks live, so the user watches the week
          // fill in as they talk. Exact times come from /propose at
          // session end and replace the drafts.
          <div className="min-h-0 flex-1">
            <WeekCalendarGrid
              events={calendarEvents}
              proposed={[]}
              draft={buildDraftBlocks(
                mergePlan(committedActions, actionsSoFar),
                weekStart,
              )}
              weekStart={weekStart ?? new Date()}
              weekLabel={weekLabel}
            />
          </div>
        ) : showProposedCalendarPanel ? (
          // `min-h-0` on the grid wrapper + `overflow-y-auto` on the list
          // below it split this column into two independently-scrollable
          // regions (grid gets a fair, non-greedy share via flex-1/min-h-0
          // instead of its own `h-full` claiming the whole column) so the
          // proposed-items list stays reachable instead of being pushed
          // below the fold by the calendar grid above it.
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className="min-h-0 flex-1">
              <WeekCalendarGrid
                events={calendarEvents}
                proposed={flattenProposedForGrid()}
                weekStart={weekStart ?? new Date()}
                weekLabel={weekLabel}
              />
            </div>
            {/* Below the grid: the same per-action list the old confirm
                screen showed, so exact ranges + partial-fit warnings stay
                visible -- a pixel grid is easier to scan for shape, a text
                list is easier for exact times. */}
            <div className="max-h-[45%] overflow-y-auto border-t border-zinc-200 px-4 py-3 dark:border-zinc-800">
              <p className="text-[11px] font-medium uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
                Proposed items
              </p>
              <ul className="mt-2 flex flex-col gap-2">
                {proposed?.map((action, i) => (
                  <li
                    key={i}
                    className="rounded-lg border border-zinc-200 p-2 text-xs dark:border-zinc-800"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-medium text-black dark:text-zinc-50">
                        {action.role} · {action.description}
                      </p>
                      <span className="shrink-0 rounded-full bg-zinc-100 px-2 py-0.5 text-[9px] uppercase tracking-wide text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                        {action.type}
                      </span>
                    </div>
                    {action.type === "project" ? (
                      <p className="mt-1 text-zinc-500 dark:text-zinc-400">
                        Tracked with a progress slider in the dashboard — no
                        calendar time.
                      </p>
                    ) : action.blocks.length === 0 ? (
                      <p className="mt-1 text-amber-600">
                        {unplacedHint(action)}
                      </p>
                    ) : (
                      <ul className="mt-1 flex flex-col gap-1 text-zinc-500 dark:text-zinc-400">
                        {action.blocks.map((b, j) => (
                          <li key={j}>
                            <span>{formatRange(b)}</span>
                            {b.conflictsWith && (
                              <span className="mt-0.5 flex items-start gap-1 text-amber-700 dark:text-amber-400">
                                <span aria-hidden>⚠</span>
                                <span>Overlaps {b.conflictsWith} — asks before writing</span>
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ) : (
          <WeeklyPlanPanel
            roles={withPersonalRole(roles)}
            actionsSoFar={mergePlan(committedActions, actionsSoFar)}
            weekConfirmed={weekConfirmed}
          />
        )}
      </div>
    </div>
  );
}

// Spec #4 payoff screen. Read-only: no chat, no revise input, no retry
// buttons. Reuses WeekCalendarGrid so the visual language matches what
// the user saw seconds ago on the confirm screen -- the difference is
// that the proposed overlay is now what actually landed on Google
// Calendar, not a preview. `flatWrittenBlocks` filters out projects
// (no calendar block) and unplaced entries so the grid shows exactly
// what got written, nothing else.
function PayoffScreen({
  proposed,
  summary,
  calendarEvents,
  weekStart,
  weekLabel,
  referralCopied,
  onCopyReferral,
  onClose,
}: {
  proposed: ProposedAction[];
  summary: {
    itemsCreated: number;
    recapEmailSent: boolean;
    unplacedCount: number;
    overlappingCount: number;
    alreadyConfirmed: boolean;
  };
  calendarEvents: CalendarEvent[];
  weekStart: Date;
  weekLabel: string | null;
  referralCopied: boolean;
  onCopyReferral: () => void;
  onClose: () => void;
}) {
  // Same shape flattenProposedForGrid produces during the live confirm
  // screen, on purpose -- the payoff screen's grid is meant to look
  // identical to the block layout the user just approved, minus the
  // "still editable" affordances. Project actions have empty `blocks` so
  // they naturally drop out of this flatten.
  const flatWrittenBlocks: CalendarProposedBlock[] = proposed.flatMap((a) =>
    a.blocks.map((b) => ({
      role: a.role,
      description: a.description,
      start: b.start,
      end: b.end,
      conflictsWith: b.conflictsWith,
    })),
  );

  const created = summary.itemsCreated;
  const headline = summary.alreadyConfirmed
    ? "This week was already set."
    : "Your week is set.";
  const subhead = summary.alreadyConfirmed
    ? "The plan below is already on your calendar — nothing to do."
    : created === 0
      ? "Everything you planned is tracked in Sundae. No calendar block landed this round — replan any items with a time that hasn't passed."
      : `${created} calendar block${created === 1 ? "" : "s"} landed on your Google Calendar. Everything below is live.`;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-zinc-50 font-sans dark:bg-black">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-6 py-12">
        <div className="flex flex-col gap-2">
          <span className="text-xs font-medium uppercase tracking-widest text-emerald-700 dark:text-emerald-400">
            Locked in
          </span>
          <h1 className="text-3xl font-semibold tracking-tight text-black dark:text-zinc-50">
            {headline}
          </h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">{subhead}</p>
          {summary.recapEmailSent && !summary.alreadyConfirmed && (
            <p className="text-sm text-zinc-500 dark:text-zinc-500">
              A recap of last week — wins, what to improve, and how each role
              landed — just went out to your inbox.
            </p>
          )}
          {(summary.overlappingCount > 0 || summary.unplacedCount > 0) && !summary.alreadyConfirmed && (
            <p className="text-sm text-amber-700 dark:text-amber-400">
              {summary.overlappingCount > 0 &&
                `${summary.overlappingCount} block${summary.overlappingCount === 1 ? "" : "s"} overlap${summary.overlappingCount === 1 ? "s" : ""} something you already had on your calendar. `}
              {summary.unplacedCount > 0 &&
                `${summary.unplacedCount} item${summary.unplacedCount === 1 ? "" : "s"} couldn't fit this week's remaining time.`}
            </p>
          )}
        </div>

        {/* Read-only week view. Height clamped so the CTA + referral stay
            above the fold on a normal laptop screen; the grid scrolls
            internally if it needs to. */}
        <div className="h-[420px] overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
          <WeekCalendarGrid
            events={calendarEvents}
            proposed={flatWrittenBlocks}
            weekStart={weekStart}
            weekLabel={weekLabel ?? undefined}
          />
        </div>

        <div className="flex flex-col items-start gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full bg-black px-5 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
          >
            Close and start your week
          </button>

          {/* Light referral prompt (spec #4). Copies the landing-page URL
              to the clipboard rather than routing through a real referral
              endpoint -- that infra doesn't exist yet, and the goal here
              is just the ask, not attribution. Swap for a signed referral
              link once billing/attribution ships. */}
          <div className="flex flex-wrap items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
            <span>Your week is locked in. Know someone who&apos;d want this?</span>
            <button
              type="button"
              onClick={onCopyReferral}
              className="rounded-full border border-zinc-300 px-3 py-1 text-xs text-zinc-700 transition hover:border-zinc-400 dark:border-zinc-700 dark:text-zinc-300 dark:hover:border-zinc-500"
            >
              {referralCopied ? "Link copied ✓" : "Copy share link"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
