"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { ClassifiedAction, ConversationState } from "@/lib/engine/weeklySessionTypes";

type Turn = { from: "engine" | "user"; text: string };

type ProposedBlock = { start: string; end: string };
type ProposedAction = {
  role: string;
  description: string;
  type: "habit" | "goal" | "project";
  blocks: ProposedBlock[];
};

type Stage = "checking" | "signed-out" | "chatting" | "proposing" | "confirming" | "writing" | "done";

// Real weekly-session UI (Day 10): Accountability -> Goal Setting ->
// Planning, driven by src/lib/engine/weeklySession.ts, then a confirmation
// screen before anything gets written to Google Calendar + weekly_items,
// per the MVP spec's "read -> propose -> confirm -> write" permissions
// model. Same "plain, functional first" treatment as /onboarding (Day 7) --
// visual polish is a later pass.
export default function WeeklySessionPage() {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>("checking");

  const [state, setState] = useState<ConversationState | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [proposed, setProposed] = useState<ProposedAction[] | null>(null);
  const [itemsCreated, setItemsCreated] = useState<number | null>(null);

  useEffect(() => {
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

      setStage("chatting");
      void send("");
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        await propose(body.action.actions);
      }
    } finally {
      setSending(false);
    }
  }

  async function propose(actions: ClassifiedAction[]) {
    setStage("proposing");
    const res = await fetch("/api/weekly-session/propose", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ actions }),
    });
    const body = await res.json();
    if (!res.ok) {
      setError(body.error ?? "Couldn't propose calendar blocks — your answers aren't lost.");
      setStage("chatting");
      return;
    }
    setProposed(body.proposed);
    setStage("confirming");
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
    void send(message);
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
              Nothing&apos;s on your calendar yet — review before it writes anything.
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

          <button
            onClick={confirm}
            disabled={stage === "writing"}
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
        <div className="flex max-w-lg flex-col gap-3 text-center">
          <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">This week is set.</h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            {itemsCreated} item{itemsCreated === 1 ? "" : "s"} written for this week. Habit and Goal
            blocks are on your Google Calendar; Project items are ready to track in the dashboard.
          </p>
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
            Weekly planning session
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
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type your answer…"
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
      </div>
    </div>
  );
}
