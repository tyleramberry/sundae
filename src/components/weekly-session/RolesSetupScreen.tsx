import type { FormEvent, RefObject } from "react";
import { ChatBubble, TypingDots } from "@/components/weekly-session/ChatBits";

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
            <ChatBubble key={i} turn={turn} />
          ))}
          {sending && <TypingDots />}
        </div>

        <form onSubmit={onSubmit} className="flex gap-3">
          <input
            ref={chatInputRef}
            autoFocus
            value={input}
            onChange={(e) => onInputChange(e.target.value)}
            placeholder="Type your answer…"
            disabled={sending}
            className="flex-1 rounded-full border border-zinc-300 px-4 py-2 text-sm text-black disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          />
          <button
            type="submit"
            disabled={sending}
            className="rounded-full bg-black px-4 py-2 text-sm text-white disabled:opacity-50 dark:bg-white dark:text-black"
          >
            Send
          </button>
        </form>
      </div>
    </div>
  );
}
