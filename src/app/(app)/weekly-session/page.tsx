"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { ClassifiedAction, ConversationState } from "@/lib/engine/weeklySessionTypes";
import type { RoleAnswer } from "@/lib/engine/types";

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
  | "writing"
  | "done";

// Real weekly-session UI (Day 10): Accountability -> Goal Setting ->
// Planning, driven by src/lib/engine/weeklySession.ts, then a confirmation
// screen before anything gets written to Google Calendar + weekly_items,
// per the MVP spec's "read -> propose -> confirm -> write" permissions
// model.
//
// Day 7 redesign added a "roles-setup" stage in front of the real session:
// the old onboarding chat used to capture roles/goals before the user ever
// got here (see docs/onboarding-flow.md's history). Onboarding is now a
// survey/demo/hype flow with no functional data capture of its own, so the
// *first* time a user lands here with no `onboarding_answers` row yet, this
// page runs that exact same roles/goals conversation itself (same engine,
// same /api/engine/step route, same persistence) before handing off into
// Stage 1-3 of the real weekly session. Every session after the first skips
// straight to "chatting" since the row already exists.
//
// The confirm screen is no longer take-it-or-leave-it: the user can talk to
// Sundae about the proposed plan (/api/weekly-session/revise) and the blocks
// re-propose in place, and the "done" screen links into the dashboard so the
// flow doesn't dead-end.
export default function WeeklySessionPage() {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>("checking");

  const [state, setState] = useState<ConversationState | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The engine's classified actions from the completed session -- kept so
  // the confirm screen can re-propose after a revision without re-running
  // the whole conversation.
  const [sessionActions, setSessionActions] = useState<ClassifiedAction[]>([]);
  const [proposed, setProposed] = useState<ProposedAction[] | null>(null);
  const [itemsCreated, setItemsCreated] = useState<number | null>(null);

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
        setStage("chatting");
        void send("");
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

  async function finishRolesSetup(roles: string[], answers: RoleAnswer[]) {
    setSending(true);
    try {
      const res = await fetch("/api/onboarding/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roles, answers }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Couldn't save your roles — try confirming again.");
        return;
      }
      // Clean handoff into the real session: fresh transcript, fresh engine
      // state, one short bridging line so the switch from "roles" to
      // "planning" doesn't feel like a hard cut.
      setTurns([{ from: "engine", text: "Roles are set. Let's plan your week." }]);
      setState(null);
      setStage("chatting");
      // Explicit null start-state — the weekly session begins fresh, not
      // from the roles transcript still sitting in the stale `state` closure.
      void send("", null);
    } finally {
      setSending(false);
    }
  }

  // `fromState` defaults to the current closure `state`, but the roles->
  // planning handoff must pass an explicit `null`: it calls setState(null)
  // and send("") back-to-back, and setState is async, so the closure `state`
  // is still the (assistant-ending) roles transcript at call time. Sending
  // that to the weekly engine makes the conversation end on an assistant
  // message, which the API rejects ("does not support assistant message
  // prefill"). Passing the starting state explicitly sidesteps the stale
  // closure entirely.
  async function send(message: string, fromState: ConversationState | null = state) {
    if (message) {
      setTurns((t) => [...t, { from: "user" as const, text: message }]);
    }
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/weekly-session/step", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, state: fromState }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "Something went wrong. Try again.");
        return;
      }
      setTurns((t) => [...t, { from: "engine" as const, text: body.reply }]);
      setState(body.state);

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
      const p = await fetchProposed(body.actions);
      if (p) setProposed(p);
    } finally {
      setRevising(false);
    }
  }

  async function confirm() {
    if (!proposed) return;
    setStage("writing");
    setError(null);
    const res = await fetch("/api/weekly-session/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ proposed }),
    });
    const body = await res.json();
    if (!res.ok) {
      setError(body.error ?? "Couldn't write to your calendar — try confirming again.");
      setStage("confirming");
      return;
    }
    setItemsCreated(body.itemsCreated);
    setStage("done");
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

  if (stage === "confirming" || stage === "writing") {
    return (
      <div className="flex flex-1 flex-col items-center bg-zinc-50 px-6 py-16 font-sans dark:bg-black">
        <div className="flex w-full max-w-lg flex-col gap-6">
          <div>
            <span className="text-sm font-medium uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
              Sundae
            </span>
            <h1 className="mt-1 text-2xl font-semibold text-black dark:text-zinc-50">
              Confirm this week&apos;s plan
            </h1>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              Nothing&apos;s on your calendar yet — review it, or tell Sundae what to change
              below, before it writes anything.
            </p>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex flex-col gap-3">
            {proposed?.map((action, i) => (
              <div key={i} className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-black dark:text-zinc-50">
                    {action.role} · {action.description}
                  </p>
                  <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs uppercase tracking-wide text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                    {action.type}
                  </span>
                </div>
                {action.type === "project" ? (
                  <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                    Tracked with a progress slider in the dashboard — no calendar time.
                  </p>
                ) : action.blocks.length === 0 ? (
                  <p className="mt-2 text-sm text-amber-600">
                    No open calendar time found for this — you can add it manually later.
                  </p>
                ) : (
                  <ul className="mt-2 flex flex-col gap-1">
                    {action.blocks.map((b, j) => (
                      <li key={j} className="text-sm text-zinc-600 dark:text-zinc-400">
                        {formatRange(b)}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>

          {/* Revision chat: talk to Sundae about the plan before writing. */}
          <div className="flex flex-col gap-2 border-t border-zinc-200 pt-4 dark:border-zinc-800">
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Want to change anything?
            </p>
            {reviseTurns.map((turn, i) => (
              <div
                key={i}
                className={`max-w-md rounded-lg px-4 py-2 text-sm whitespace-pre-wrap ${
                  turn.from === "engine"
                    ? "self-start bg-zinc-200 text-black dark:bg-zinc-800 dark:text-zinc-100"
                    : "self-end bg-black text-white dark:bg-white dark:text-black"
                }`}
              >
                {turn.text}
              </div>
            ))}
            {revising && (
              <div className="flex max-w-md items-center gap-1 self-start rounded-lg bg-zinc-200 px-4 py-3 dark:bg-zinc-800">
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-500 [animation-delay:-0.3s] dark:bg-zinc-400" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-500 [animation-delay:-0.15s] dark:bg-zinc-400" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-500 dark:bg-zinc-400" />
              </div>
            )}
            <form onSubmit={handleReviseSubmit} className="mt-1 flex gap-3">
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
          </div>

          <button
            onClick={confirm}
            disabled={stage === "writing" || revising}
            className="self-start rounded-full bg-black px-4 py-2 text-sm text-white disabled:opacity-50 dark:bg-white dark:text-black"
          >
            {stage === "writing" ? "Writing to calendar…" : "Confirm & write to calendar"}
          </button>
        </div>
      </div>
    );
  }

  if (stage === "done") {
    return (
      <div className="flex flex-1 flex-col items-center justify-center bg-zinc-50 px-6 font-sans dark:bg-black">
        <div className="flex max-w-lg flex-col items-center gap-4 text-center">
          <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">This week is set.</h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            {itemsCreated} item{itemsCreated === 1 ? "" : "s"} written for this week. Habit and Goal
            blocks are on your Google Calendar; Project items are ready to track in the dashboard.
          </p>
          <Link
            href="/dashboard"
            className="mt-2 rounded-full bg-black px-5 py-2.5 text-sm text-white dark:bg-white dark:text-black"
          >
            View your dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col items-center bg-zinc-50 px-6 py-16 font-sans dark:bg-black">
      <div className="flex w-full max-w-lg flex-1 flex-col gap-6">
        <div>
          <span className="text-sm font-medium uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
            Sundae
          </span>
          <h1 className="mt-1 text-2xl font-semibold text-black dark:text-zinc-50">
            {stage === "roles-setup" ? "Let's set up your roles" : "Weekly planning session"}
          </h1>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex flex-1 flex-col gap-2">
          {turns.map((turn, i) => (
            <div
              key={i}
              className={`max-w-md rounded-lg px-4 py-2 text-sm whitespace-pre-wrap ${
                turn.from === "engine"
                  ? "self-start bg-zinc-200 text-black dark:bg-zinc-800 dark:text-zinc-100"
                  : "self-end bg-black text-white dark:bg-white dark:text-black"
              }`}
            >
              {turn.text}
            </div>
          ))}
          {(sending || stage === "proposing") && (
            <div className="flex max-w-md items-center gap-1 self-start rounded-lg bg-zinc-200 px-4 py-3 dark:bg-zinc-800">
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-500 [animation-delay:-0.3s] dark:bg-zinc-400" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-500 [animation-delay:-0.15s] dark:bg-zinc-400" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-500 dark:bg-zinc-400" />
            </div>
          )}
        </div>

        <form onSubmit={handleSubmit} className="flex gap-3">
          <input
            ref={chatInputRef}
            autoFocus
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type your answer…"
            disabled={sending || (stage !== "chatting" && stage !== "roles-setup")}
            className="flex-1 rounded-full border border-zinc-300 px-4 py-2 text-sm text-black disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          />
          <button
            type="submit"
            disabled={sending || (stage !== "chatting" && stage !== "roles-setup")}
            className="rounded-full bg-black px-4 py-2 text-sm text-white disabled:opacity-50 dark:bg-white dark:text-black"
          >
            Send
          </button>
        </form>
      </div>
    </div>
  );
}
