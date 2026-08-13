type Turn = { from: "engine" | "user"; text: string };

export function ChatBubble({ turn }: { turn: Turn }) {
  return (
    <div
      className={`max-w-md rounded-lg px-4 py-2 text-sm whitespace-pre-wrap ${
        turn.from === "engine"
          ? "self-start bg-zinc-200 text-black dark:bg-zinc-800 dark:text-zinc-100"
          : "self-end bg-black text-white dark:bg-white dark:text-black"
      }`}
    >
      {turn.text}
    </div>
  );
}

export function TypingDots() {
  return (
    <div className="flex max-w-md items-center gap-1 self-start rounded-lg bg-zinc-200 px-4 py-3 dark:bg-zinc-800">
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-500 [animation-delay:-0.3s] dark:bg-zinc-400" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-500 [animation-delay:-0.15s] dark:bg-zinc-400" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-500 dark:bg-zinc-400" />
    </div>
  );
}
