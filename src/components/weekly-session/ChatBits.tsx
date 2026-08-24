type Turn = { from: "engine" | "user"; text: string };

// Spec #1 (2026-08-24): planning-partner chat surface. Engine turns get a
// subtle sage avatar ("S" glyph) so it reads as Sundae talking, not a form
// field. Avatar/name label are opt-in per turn -- consecutive turns from
// the same speaker share a single avatar/name label at the top of the run,
// which is what makes the transcript feel like a conversation instead of
// a stream of independent messages. groupTurns() below computes the flags.
//
// Bubble shape: rounded-2xl with the top corner nearest the speaker's edge
// squared off (rounded-tl-md for engine, rounded-tr-md for user). Same
// pattern as most modern chat UIs -- makes the source of each message
// legible at a glance without a name label on every single one.
export function ChatBubble({
  turn,
  showAvatar = true,
  showName = false,
}: {
  turn: Turn;
  showAvatar?: boolean;
  showName?: boolean;
}) {
  if (turn.from === "engine") {
    return (
      <div className="flex animate-[fade-in-up_0.28s_ease-out] items-start gap-3">
        <div
          aria-hidden
          className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${
            showAvatar
              ? "bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200/70 dark:bg-emerald-100 dark:text-emerald-700 dark:ring-emerald-200/70"
              : "invisible"
          }`}
        >
          S
        </div>
        <div className="flex flex-col items-start gap-1">
          {showName && (
            <span className="text-[10px] font-medium uppercase tracking-widest text-zinc-500 dark:text-zinc-500">
              Sundae
            </span>
          )}
          <div className="max-w-md whitespace-pre-wrap rounded-2xl rounded-tl-md bg-zinc-100 px-4 py-2.5 text-sm leading-relaxed text-zinc-900 dark:bg-zinc-100 dark:text-zinc-900">
            {turn.text}
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="flex animate-[fade-in-up_0.28s_ease-out] justify-end">
      <div className="max-w-md whitespace-pre-wrap rounded-2xl rounded-tr-md bg-emerald-600 px-4 py-2.5 text-sm leading-relaxed text-white dark:bg-emerald-600 dark:text-white">
        {turn.text}
      </div>
    </div>
  );
}

// Group consecutive same-speaker turns: the first turn in a run gets the
// avatar (and optionally the "Sundae" name label if it's the very first
// engine turn in the whole transcript), the rest suppress them. Keeps the
// left rail visually calm instead of a stack of identical avatars.
export function turnMeta(
  turns: Turn[],
): Array<{ showAvatar: boolean; showName: boolean }> {
  const meta: Array<{ showAvatar: boolean; showName: boolean }> = [];
  let firstEngineSeen = false;
  for (let i = 0; i < turns.length; i++) {
    const t = turns[i];
    const prev = turns[i - 1];
    const startsRun = !prev || prev.from !== t.from;
    const showAvatar = t.from === "engine" && startsRun;
    const showName = t.from === "engine" && startsRun && !firstEngineSeen;
    if (t.from === "engine" && startsRun) firstEngineSeen = true;
    meta.push({ showAvatar, showName });
  }
  return meta;
}

export function TypingDots() {
  return (
    <div className="flex items-start gap-3">
      <div
        aria-hidden
        className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-200/70"
      >
        S
      </div>
      <div className="flex items-center gap-1 rounded-2xl rounded-tl-md bg-zinc-100 px-4 py-3 dark:bg-zinc-100">
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-500 [animation-delay:-0.3s]" />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-500 [animation-delay:-0.15s]" />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-500" />
      </div>
    </div>
  );
}
