"use client";

import { useState } from "react";
import type { ConversationState } from "@/lib/engine/types";

type Turn = { from: "engine" | "user"; text: string };

// Raw debug view for the channel-agnostic planning engine (Day 6). Lets you
// play through the onboarding question tree by hand, same as you'd talk to
// it over SMS/voice later — this page is just today's stand-in transport.
export default function EngineDebugPage() {
  const [state, setState] = useState<ConversationState | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [done, setDone] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(message: string) {
    // Same optimistic-send fix as the real onboarding page: show the user's
    // message immediately instead of waiting for the round trip.
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
        setError(body.error ?? "Unknown error");
        return;
      }
      setTurns((t) => [...t, { from: "engine" as const, text: body.reply }]);
      setState(body.state);
      setDone(body.action?.type === "complete");
    } finally {
      setSending(false);
    }
  }

  function start() {
    setTurns([]);
    setState(null);
    setDone(false);
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
        Engine debug view — onboarding
      </h1>

      <div className="flex gap-3 font-sans">
        <button
          onClick={start}
          disabled={sending}
          className="rounded-full bg-black px-4 py-2 text-sm text-white disabled:opacity-50 dark:bg-white dark:text-black"
        >
          Start new onboarding conversation
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
          Onboarding complete for this session.
        </p>
      )}

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
