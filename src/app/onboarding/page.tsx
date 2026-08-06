"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { ConversationState, RoleAnswers } from "@/lib/engine/types";

type Turn = { from: "engine" | "user"; text: string };

type LoadState = "checking" | "signed-out" | "in-progress" | "already-done" | "saving" | "done";

type ExistingAnswers = {
  roles: string[];
  answers: Record<string, RoleAnswers>;
};

// Real onboarding UI (Day 7): role input -> per-role goals/context -> final
// confirmation, driven entirely by the existing channel-agnostic engine
// (src/lib/engine) — this page is just today's transport, same as the web
// UI will eventually sit alongside SMS/voice per the MVP spec. Deliberately
// plain: functional first, visual polish is a later pass (see 30-day plan).
export default function OnboardingPage() {
  const router = useRouter();
  const [load, setLoad] = useState<LoadState>("checking");
  const [existing, setExisting] = useState<ExistingAnswers | null>(null);

  const [state, setState] = useState<ConversationState | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Auth gate + check for an already-completed run.
  useEffect(() => {
    void (async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setLoad("signed-out");
        router.replace("/login?next=/onboarding");
        return;
      }

      const res = await fetch("/api/onboarding/complete");
      const body = await res.json();
      if (res.ok && body.answers) {
        setExisting({ roles: body.answers.roles, answers: body.answers.answers });
        setLoad("already-done");
      } else {
        setLoad("in-progress");
        void send("");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function send(message: string) {
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
      setTurns((t) => [
        ...t,
        ...(message ? [{ from: "user" as const, text: message }] : []),
        { from: "engine" as const, text: body.reply },
      ]);
      setState(body.state);

      if (body.action?.type === "complete") {
        await persist(body.action.roles, body.action.answers);
      }
    } finally {
      setSending(false);
    }
  }

  async function persist(roles: string[], answers: Record<string, RoleAnswers>) {
    setLoad("saving");
    const res = await fetch("/api/onboarding/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roles, answers }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Couldn't save your answers — your session isn't lost, try again.");
      setLoad("in-progress");
      return;
    }
    setLoad("done");
  }

  function restart() {
    setExisting(null);
    setTurns([]);
    setState(null);
    setLoad("in-progress");
    void send("");
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || sending) return;
    const message = input;
    setInput("");
    void send(message);
  }

  if (load === "checking" || load === "signed-out") {
    return (
      <div className="flex flex-1 items-center justify-center bg-zinc-50 font-sans dark:bg-black">
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Loading…</p>
      </div>
    );
  }

  if (load === "already-done" && existing) {
    return (
      <div className="flex flex-1 flex-col items-center bg-zinc-50 px-6 py-16 font-sans dark:bg-black">
        <div className="flex w-full max-w-lg flex-col gap-6">
          <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">
            You&apos;re already onboarded
          </h1>
          <div className="flex flex-col gap-4">
            {existing.roles.map((role) => (
              <div
                key={role}
                className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800"
              >
                <p className="text-sm font-medium text-black dark:text-zinc-50">{role}</p>
                <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                  {existing.answers[role]?.goals.join(", ") || "(no goals captured)"}
                </p>
              </div>
            ))}
          </div>
          <button
            onClick={restart}
            className="self-start rounded-full border border-black px-4 py-2 text-sm text-black dark:border-white dark:text-white"
          >
            Redo onboarding
          </button>
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
            Let&apos;s set up your roles
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
          {load === "saving" && (
            <p className="self-start text-sm text-zinc-500 dark:text-zinc-400">Saving…</p>
          )}
        </div>

        {load === "done" ? (
          <p className="text-sm font-medium text-emerald-600">
            Locked in. Onboarding complete — nice work.
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="flex gap-3">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type your answer…"
              disabled={sending || load !== "in-progress"}
              className="flex-1 rounded-full border border-zinc-300 px-4 py-2 text-sm text-black disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            />
            <button
              type="submit"
              disabled={sending || load !== "in-progress"}
              className="rounded-full bg-black px-4 py-2 text-sm text-white disabled:opacity-50 dark:bg-white dark:text-black"
            >
              Send
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
