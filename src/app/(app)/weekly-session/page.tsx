"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { ClassifiedAction, ConversationState } from "@/lib/engine/weeklySessionTypes";
import type { RoleAnswer } from "@/lib/engine/types";
import WeeklyPlanPanel from "@/components/WeeklyPlanPanel";
import WeekCalendarGrid, {
  type CalendarEvent,
  type ProposedBlock as CalendarProposedBlock,
} from "@/components/WeekCalendarGrid";
import { ChatBubble, TypingDots } from "@/components/weekly-session/ChatBits";
import { RolesSetupScreen } from "@/components/weekly-session/RolesSetupScreen";

type Turn = { from: "engine" | "user"; text: string };

type ProposedBlock = { start: string; end: string };
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
  | "writing";

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

  // Real Google Calendar events for this week -- powers the WeekCalendarGrid
  // background layer, so proposed blocks show up on top of what's actually
  // scheduled rather than a blank grid. Fetched once when the chat begins
  // (so the grid renders instantly the moment the session completes),
  // refreshed after /confirm writes new events.
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
  const [weekStart] = useState<Date>(() => {
    // Sunday-anchored, matches startOfWeek() in src/lib/google/calendar.ts.
    // Fixed at page mount so day-column math doesn't shift if the user's
    // session crosses midnight -- keeps the grid stable during a long chat.
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - d.getDay());
    return d;
  });

  // Mobile-only toggle to reveal the audit-trail / calendar panel over the
  // chat -- the two-column split doesn't fit under ~600px, same call the
  // AppSidebar makes to collapse into a top bar.
  const [mobilePanelOpen, setMobilePanelOpen] = useState(false);

  // Confirm-screen revision chat.
  const [reviseTurns, setReviseTurns] = useState<Turn[]>([]);
  const [reviseInput, setReviseInput] = useState("");
  const [revising, setRevising] = useState(false);

  const chatInputRef = useRef<HTMLInputElement>(null);
  const reviseInputRef = useRef<HTMLInputElement>(null);
  // Guards the mount effect against React StrictMode's double-invoke in dev,
  // which otherwise fires the opening engine turn twice and shows the
  // welcome message duplicated.
  const didInit = useRef(false);
  const confirmInFlight = useRef(false);

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
        void loadCalendarEvents();

        // Day 16: resume this week's chat if one already exists instead of
        // always starting fresh -- see GET /api/weekly-session/transcript.
        // A transcript with turns already in it means the server has real
        // conversation history; calling send("") again would re-send an
        // empty message on top of that (harmless server-side, since /step
        // ignores a blank message when there's already history) so it's
        // gated here mainly to avoid the visible "..." typing flash on
        // every reload of an already-open chat.
        const transcriptRes = await fetch("/api/weekly-session/transcript");
        const transcriptBody = await transcriptRes.json().catch(() => ({}));
        const transcript = transcriptRes.ok ? transcriptBody.transcript : null;

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

  // Best-effort background fetch: the grid can render without real events
  // (dashed proposed blocks over an empty week is still useful), so a
  // failure here just leaves calendarEvents empty rather than blocking the
  // session or showing an error banner. A real error the user can act on
  // -- expired Google token, etc. -- will surface on the next real read
  // during /propose or /confirm.
  async function loadCalendarEvents() {
    try {
      const res = await fetch("/api/calendar/events");
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
      void loadCalendarEvents();
      void send("");
    } finally {
      setSending(false);
    }
  }

  // Day 16: the server owns the weekly-session conversation (see
  // /api/weekly-session/step) -- this just sends the user's message and
  // renders whatever comes back. No client-side ConversationState
  // round-trip anymore, which also removes the stale-closure hazard the
  // old roles->planning handoff used to need an explicit workaround for.
  async function send(message: string) {
    if (message) {
      setTurns((t) => [...t, { from: "user" as const, text: message }]);
    }
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/weekly-session/step", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "Something went wrong. Try again.");
        return;
      }
      setTurns((t) => [...t, { from: "engine" as const, text: body.reply }]);

      // Keep the audit-trail panel current with whatever the engine has
      // classified so far this round -- even before the round is
      // complete, so the user sees each new item land as it happens.
      if (Array.isArray(body.actionsSoFar)) {
        setActionsSoFar(body.actionsSoFar as ClassifiedAction[]);
      }

      if (body.action?.type === "complete") {
        await propose(body.action.actions);
      }
    } finally {
      setSending(false);
    }
  }

  // Turns a classified action list into proposed calendar blocks. Shared by
  // the initial propose (session complete) and every in-place re-propose
  // after a revision, so scheduling always runs the same route.
  async function fetchProposed(actions: ClassifiedAction[]): Promise<ProposedAction[] | null> {
    const res = await fetch("/api/weekly-session/propose", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ actions }),
    });
    const body = await res.json();
    if (!res.ok) {
      setError(body.error ?? "Couldn't propose calendar blocks — your answers aren't lost.");
      return null;
    }
    return body.proposed as ProposedAction[];
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
    } finally {
      setRevising(false);
    }
  }

  async function confirm() {
    if (!proposed || confirmInFlight.current) return;
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
      body: JSON.stringify({ proposed }),
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
    // Day 16: no dead-end "done" screen -- drop back into the same chat,
    // ready for whatever comes up mid-week. Mirrors the confirmation
    // bubble the server itself appended to display_turns (see
    // recordWeeklySessionConfirmed) so the user sees it land immediately
    // rather than waiting on a refetch.
    const created = body.itemsCreated as number;
    const already = Boolean(body.alreadyConfirmed);
    const confirmationBubbles: Turn[] = already
      ? [{ from: "engine", text: "This plan was already written to your calendar." }]
      : [
          { from: "engine", text: `${created} item${created === 1 ? "" : "s"} written to your calendar.` },
        ];
    if (body.recapEmailSent) {
      confirmationBubbles.push({
        from: "engine",
        text: "A recap of last week — wins, what to improve, and how each role landed — just went out to your inbox.",
      });
    }
    setTurns((t) => [...t, ...confirmationBubbles]);
    setWeekConfirmed(true);
    setActionsSoFar([]);
    setSessionActions([]);
    setProposed(null);
    setReviseTurns([]);
    void loadCalendarEvents();
    setStage("chatting");
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

  if (stage === "checking" || stage === "signed-out") {
    return (
      <div className="flex flex-1 items-center justify-center bg-zinc-50 font-sans dark:bg-black">
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Loading…</p>
      </div>
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
  const showCalendarPanel =
    stage === "confirming" || stage === "writing" || stage === "proposing";

  return (
    // `min-h-0` here (and again one level down on the messages wrapper)
    // is what makes the transcript scroll *inside* its own pane instead of
    // growing the whole page -- `main` upstream (see (app)/layout.tsx) is
    // already clamped to the viewport, but a flex child's default
    // `min-height: auto` still lets it expand past that unless overridden.
    <div className="flex min-h-0 flex-1 flex-col bg-zinc-50 font-sans dark:bg-black md:flex-row">
      {/* LEFT: conversation. */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden md:max-w-xl md:border-r md:border-zinc-200 md:dark:border-zinc-800">
        <div className="flex items-start justify-between border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
          <div>
            <span className="text-sm font-medium uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
              Sundae
            </span>
            <h1 className="mt-1 text-2xl font-semibold text-black dark:text-zinc-50">
              {stage === "confirming" || stage === "writing"
                ? "Confirm this week's plan"
                : "Weekly planning session"}
            </h1>
            {(stage === "confirming" || stage === "writing") && (
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                Nothing&apos;s on your calendar yet — review it, or tell Sundae
                what to change below, before it writes anything.
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
          <div className="flex flex-1 flex-col gap-2 overflow-y-auto px-6 py-4">
            {error && <p className="text-sm text-red-600">{error}</p>}

            {turns.map((turn, i) => (
              <ChatBubble key={i} turn={turn} />
            ))}
            {(sending || stage === "proposing") && <TypingDots />}

            {/* Confirm-screen revision transcript sits inline below the main
                chat, same conversational spirit -- the divider makes clear
                these turns are about the plan, not the session itself. */}
            {(stage === "confirming" || stage === "writing") && (
              <>
                <div className="mt-4 border-t border-zinc-200 pt-4 dark:border-zinc-800">
                  <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                    Want to change anything?
                  </p>
                </div>
                {reviseTurns.map((turn, i) => (
                  <ChatBubble key={i} turn={turn} />
                ))}
                {revising && <TypingDots />}
              </>
            )}
          </div>

          <div className="border-t border-zinc-200 px-6 py-4 dark:border-zinc-800">
            {stage === "confirming" || stage === "writing" ? (
              <div className="flex flex-col gap-3">
                <form onSubmit={handleReviseSubmit} className="flex gap-3">
                  <input
                    ref={reviseInputRef}
                    value={reviseInput}
                    onChange={(e) => setReviseInput(e.target.value)}
                    placeholder="e.g. move the temple shift to Saturday"
                    disabled={revising || stage === "writing"}
                    className="flex-1 rounded-full border border-zinc-300 px-4 py-2 text-sm text-black disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                  />
                  <button
                    type="submit"
                    disabled={revising || stage === "writing" || !reviseInput.trim()}
                    className="rounded-full border border-zinc-300 px-4 py-2 text-sm text-black disabled:opacity-50 dark:border-zinc-700 dark:text-white"
                  >
                    Send
                  </button>
                </form>
                <button
                  onClick={confirm}
                  disabled={stage === "writing" || revising}
                  className="self-start rounded-full bg-black px-4 py-2 text-sm text-white disabled:opacity-50 dark:bg-white dark:text-black"
                >
                  {stage === "writing" ? "Writing to calendar…" : "Confirm & write to calendar"}
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
                    weekConfirmed ? "What else is on your mind this week?" : "Type your answer…"
                  }
                  disabled={sending || stage !== "chatting"}
                  className="flex-1 rounded-full border border-zinc-300 px-4 py-2 text-sm text-black disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                />
                <button
                  type="submit"
                  disabled={sending || stage !== "chatting"}
                  className="rounded-full bg-black px-4 py-2 text-sm text-white disabled:opacity-50 dark:bg-white dark:text-black"
                >
                  Send
                </button>
              </form>
            )}
          </div>
        </div>
      </div>

      {/* RIGHT: live audit-trail panel (during chatting) or WeekCalendarGrid
          (once /propose runs). Full-width on mobile only when toggled open;
          always visible on md+. */}
      <div
        className={`${
          mobilePanelOpen ? "flex" : "hidden"
        } min-h-0 flex-1 flex-col overflow-hidden bg-zinc-50 md:flex md:max-w-2xl md:bg-white md:dark:bg-zinc-950`}
      >
        {showCalendarPanel ? (
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
                weekStart={weekStart}
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
                        No open calendar time for this — add it manually
                        later.
                      </p>
                    ) : (
                      <ul className="mt-1 flex flex-col gap-0.5 text-zinc-500 dark:text-zinc-400">
                        {action.blocks.map((b, j) => (
                          <li key={j}>{formatRange(b)}</li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ) : (
          <WeeklyPlanPanel roles={roles} actionsSoFar={actionsSoFar} />
        )}
      </div>
    </div>
  );
}
