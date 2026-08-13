"use client";

import { useState } from "react";
import type { ClassifiedAction, ConversationState } from "@/lib/engine/weeklySessionTypes";

type Turn = { from: "engine" | "user"; text: string };
type UsageLogEntry = {
  inputTokens: number;
  outputTokens: number;
  cacheCreationInputTokens: number;
  cacheReadInputTokens: number;
};

// Raw debug view for the weekly-session engine (Day 10), same spirit as
// /debug/engine for onboarding: play through Accountability -> Goal
// Setting -> Planning by hand, with a fake role list and an optional fake
// "last week" so the SMART drill-down and rollover logic can be exercised
// without needing a real onboarding record or a week of history behind it.
export default function WeeklySessionDebugPage() {
  const [rolesInput, setRolesInput] = useState("Founder, Athlete");
  const [includeLastWeek, setIncludeLastWeek] = useState(false);
  // Day 16: exercise the addendum prompt directly, without needing a real
  // weekly_session_transcripts row with completed_at already set.
  const [mode, setMode] = useState<"full" | "addendum">("full");

  const [state, setState] = useState<ConversationState | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [done, setDone] = useState(false);
  const [actions, setActions] = useState<ClassifiedAction[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [usageLog, setUsageLog] = useState<UsageLogEntry[]>([]);

  function roles() {
    return rolesInput
      .split(",")
      .map((r) => r.trim())
      .filter(Boolean);
  }

  function lastWeek() {
    if (!includeLastWeek) return null;
    return {
      weekStart: "2026-08-03",
      items: [
        { role: "Founder", type: "goal" as const, title: "Send investor update", done: true, percent: null },
        { role: "Founder", type: "project" as const, title: "Push the seed round forward", done: false, percent: 40 },
        { role: "Athlete", type: "habit" as const, title: "Work out every morning", done: false, percent: null },
      ],
    };
  }

  async function send(message: string) {
    if (message) {
      setTurns((t) => [...t, { from: "user" as const, text: message }]);
    }
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/weekly-session/debug-step", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          state,
          roles: roles(),
          lastWeek: lastWeek(),
          mode,
          // Round-trip this round's own actionsSoFar back in as
          // lockedActions, the same way the real /step route round-trips
          // the persisted transcript's actions_so_far -- otherwise this
          // harness can't exercise the locked-actions stability fix.
          lockedActions: actions,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "Unknown error");
        return;
      }
      setTurns((t) => [...t, { from: "engine" as const, text: body.reply }]);
      setState(body.state);
      setActions(body.actionsSoFar ?? []);
      setDone(body.action?.type === "complete");
      if (body.usage) setUsageLog((u) => [...u, body.usage]);
    } finally {
      setSending(false);
    }
  }

  function start() {
    setTurns([]);
    setState(null);
    setDone(false);
    setActions([]);
    setUsageLog([]);
    void send("");
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim()) return;
    const message = input;
    setInput("");
    void send(message);
  }

  return (
    <div className="flex flex-1 flex-col gap-6 bg-zinc-50 p-8 font-mono dark:bg-black">
      <h1 className="font-sans text-2xl font-semibold text-black dark:text-zinc-50">
        Engine debug view — weekly session
      </h1>

      <div className="flex flex-col gap-3 font-sans">
        <label className="flex flex-col gap-1 text-sm text-zinc-600 dark:text-zinc-400">
          Roles this week (comma-separated)
          <input
            value={rolesInput}
            onChange={(e) => setRolesInput(e.target.value)}
            disabled={turns.length > 0}
            className="rounded-lg border border-zinc-300 px-3 py-2 text-sm text-black disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          />
        </label>
        <label className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
          <input
            type="checkbox"
            checked={includeLastWeek}
            onChange={(e) => setIncludeLastWeek(e.target.checked)}
            disabled={turns.length > 0}
          />
          Include a fake &quot;last week&quot; (exercises Stage 1 / rollover)
        </label>
        <label className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
          <input
            type="checkbox"
            checked={mode === "addendum"}
            onChange={(e) => setMode(e.target.checked ? "addendum" : "full")}
            disabled={turns.length > 0}
          />
          Addendum mode (Day 16 mid-week continuation, skips Stage 1/2)
        </label>
        <button
          onClick={start}
          disabled={sending}
          className="self-start rounded-full bg-black px-4 py-2 text-sm text-white disabled:opacity-50 dark:bg-white dark:text-black"
        >
          Start new weekly session
        </button>
      </div>

      {error && <p className="font-sans text-sm text-red-600">{error}</p>}

      <div className="flex flex-col gap-2">
        {turns.map((turn, i) => (
          <div
            key={i}
            className={`max-w-2xl rounded-lg px-4 py-2 text-sm whitespace-pre-wrap ${
              turn.from === "engine"
                ? "self-start bg-zinc-200 text-black dark:bg-zinc-800 dark:text-zinc-100"
                : "self-end bg-black text-white dark:bg-white dark:text-black"
            }`}
          >
            {turn.text}
          </div>
        ))}
        {sending && (
          <div className="flex max-w-2xl items-center gap-1 self-start rounded-lg bg-zinc-200 px-4 py-3 dark:bg-zinc-800">
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-500 [animation-delay:-0.3s] dark:bg-zinc-400" />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-500 [animation-delay:-0.15s] dark:bg-zinc-400" />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-500 dark:bg-zinc-400" />
          </div>
        )}
      </div>

      {!done && turns.length > 0 && (
        <form onSubmit={handleSubmit} className="flex gap-3 font-sans">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Reply…"
            className="flex-1 rounded-full border border-zinc-300 px-4 py-2 text-sm text-black dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          />
          <button
            type="submit"
            disabled={sending}
            className="rounded-full bg-black px-4 py-2 text-sm text-white disabled:opacity-50 dark:bg-white dark:text-black"
          >
            Send
          </button>
        </form>
      )}

      {done && (
        <p className="font-sans text-sm text-emerald-600">
          Weekly session complete for this run.
        </p>
      )}

      <div>
        <h2 className="font-sans text-sm font-medium text-zinc-500">
          Prompt cache usage, per turn
        </h2>
        <table className="mt-1 w-full max-w-2xl border-collapse text-xs">
          <thead>
            <tr className="text-left text-zinc-500">
              <th className="pr-4 pb-1">turn</th>
              <th className="pr-4 pb-1">input</th>
              <th className="pr-4 pb-1">output</th>
              <th className="pr-4 pb-1">cache write</th>
              <th className="pr-4 pb-1">cache read</th>
            </tr>
          </thead>
          <tbody>
            {usageLog.map((u, i) => (
              <tr key={i} className="text-black dark:text-zinc-100">
                <td className="pr-4 py-0.5">{i + 1}</td>
                <td className="pr-4 py-0.5">{u.inputTokens}</td>
                <td className="pr-4 py-0.5">{u.outputTokens}</td>
                <td className="pr-4 py-0.5">{u.cacheCreationInputTokens}</td>
                <td
                  className={`pr-4 py-0.5 ${u.cacheReadInputTokens > 0 ? "font-semibold text-emerald-600" : ""}`}
                >
                  {u.cacheReadInputTokens}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div>
        <h2 className="font-sans text-sm font-medium text-zinc-500">
          Classified actions so far ({actions.length})
        </h2>
        <pre className="mt-1 overflow-auto rounded-lg bg-zinc-100 p-4 text-xs text-black dark:bg-zinc-900 dark:text-zinc-100">
          {JSON.stringify(actions, null, 2)}
        </pre>
      </div>

      <div>
        <h2 className="font-sans text-sm font-medium text-zinc-500">
          Conversation state (raw)
        </h2>
        <pre className="mt-1 overflow-auto rounded-lg bg-zinc-100 p-4 text-xs text-black dark:bg-zinc-900 dark:text-zinc-100">
          {JSON.stringify(state, null, 2)}
        </pre>
      </div>
    </div>
  );
}
