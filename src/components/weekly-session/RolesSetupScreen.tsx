"use client";

import { useEffect, useRef, type FormEvent, type RefObject } from "react";
import { ChatBubble, TypingDots, turnMeta } from "@/components/weekly-session/ChatBits";

type Turn = { from: "engine" | "user"; text: string };

export function RolesSetupScreen({
  turns,
  sending,
  error,
  input,
  onInputChange,
  onSubmit,
  chatInputRef,
}: {
  turns: Turn[];
  sending: boolean;
  error: string | null;
  input: string;
  onInputChange: (value: string) => void;
  onSubmit: (e: FormEvent) => void;
  chatInputRef: RefObject<HTMLInputElement | null>;
}) {
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns, sending]);

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

        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
          {(() => {
            const meta = turnMeta(turns);
            return turns.map((turn, i) => (
              <ChatBubble
                key={i}
                turn={turn}
                showAvatar={meta[i].showAvatar}
                showName={meta[i].showName}
              />
            ));
          })()}
          {sending && <TypingDots />}
          <div ref={endRef} />
        </div>

        <form onSubmit={onSubmit} className="flex gap-3">
          <input
            ref={chatInputRef}
            autoFocus
            value={input}
            onChange={(e) => onInputChange(e.target.value)}
            placeholder="Talk to Sundae…"
            disabled={sending}
            className="flex-1 rounded-full border border-zinc-300 bg-white px-4 py-2 text-sm text-black disabled:opacity-50 dark:border-zinc-300 dark:bg-white dark:text-black"
          />
          <button
            type="submit"
            disabled={sending || !input.trim()}
            className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:opacity-50 dark:bg-emerald-600 dark:text-white"
          >
            Send
          </button>
        </form>
      </div>
    </div>
  );
}
