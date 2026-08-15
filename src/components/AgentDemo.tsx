"use client";

import { useEffect, useState } from "react";
import { useReducedMotion } from "@/lib/hooks/useReducedMotion";

// The hero's product visual: a looping, self-playing weekly session that
// runs the same goal -> clarify -> classify -> slot -> confirm path the
// real engine runs (src/lib/engine/weeklySession.ts), including the Habit
// classification and the per-role KPI denominator that comes out of it.
//
// Deliberately NOT shared with the onboarding demo in
// src/app/onboarding/page.tsx. That one is interactive, templates its
// action off the user's real words, and reports elapsed time to a hype
// screen; this one is a silent poster that has to look right with no
// input at all. Fusing them means one component carrying both sets of
// concerns behind flags.
//
// Nothing here calls the model. It's a scripted timeline -- the same
// "reliable on the most important screen" call the onboarding redesign
// made, and more so here, where the visitor hasn't signed up yet.

type Frame =
  | "typing-goal"
  | "goal"
  | "thinking"
  | "question"
  | "typing-reply"
  | "reply"
  | "classify"
  | "slotting"
  | "confirm"
  | "done";

const TIMELINE: { frame: Frame; ms: number }[] = [
  { frame: "typing-goal", ms: 0 }, // advanced by the typewriter, not the clock
  { frame: "goal", ms: 500 },
  { frame: "thinking", ms: 1150 },
  { frame: "question", ms: 1500 },
  { frame: "typing-reply", ms: 0 }, // ditto
  { frame: "reply", ms: 550 },
  { frame: "classify", ms: 1500 },
  { frame: "slotting", ms: 1900 },
  { frame: "confirm", ms: 1500 },
  { frame: "done", ms: 3600 },
];

const FRAME_ORDER = TIMELINE.map((t) => t.frame);

const GOAL_TEXT = "Get back in shape";
const REPLY_TEXT = "Work out every morning";
const TYPE_SPEED_MS = 45;

// The seven blocks the Habit classification produces, in the order they
// get slotted. Times vary the way real open gaps do rather than landing
// on a tidy 7am every day.
const SLOTS = [
  { day: "Mon", time: "6:30 AM" },
  { day: "Tue", time: "6:30 AM" },
  { day: "Wed", time: "7:15 AM" },
  { day: "Thu", time: "6:30 AM" },
  { day: "Fri", time: "6:45 AM" },
  { day: "Sat", time: "8:00 AM" },
  { day: "Sun", time: "8:00 AM" },
];

function indexOf(frame: Frame) {
  return FRAME_ORDER.indexOf(frame);
}

function atLeast(current: Frame, target: Frame) {
  return indexOf(current) >= indexOf(target);
}

export default function AgentDemo() {
  // Assumes reduced (the default) -- "done" is this loop's natural resting
  // frame either way, so guessing reduced just draws that frame first.
  const reducedMotion = useReducedMotion();
  const [frame, setFrame] = useState<Frame>("typing-goal");
  const [typed, setTyped] = useState("");
  const [slotsIn, setSlotsIn] = useState(0);
  // Remounts the transcript each loop so the CSS entrance animations
  // replay -- they don't re-fire on re-render alone.
  const [cycle, setCycle] = useState(0);

  const isTyping = frame === "typing-goal" || frame === "typing-reply";
  const typingTarget = frame === "typing-reply" ? REPLY_TEXT : GOAL_TEXT;

  // Always invoked from a timer callback, never synchronously from an
  // effect body -- so batching its setState calls here is a normal
  // event-handler-shaped update, not the "derive state via effect"
  // pattern the lint rules push back on. Redefined fresh each render, so
  // it always closes over the current `frame`; nothing except this
  // function itself ever changes `frame` mid-timer, so that closure can't
  // go stale between when a timeout is scheduled and when it fires.
  function next() {
    const i = indexOf(frame);
    const last = i === FRAME_ORDER.length - 1;
    const upcoming = last ? FRAME_ORDER[0] : FRAME_ORDER[i + 1];
    if (last) {
      setCycle((c) => c + 1);
      setSlotsIn(0);
    }
    // Reset the typing buffer in the same batch as the frame change,
    // rather than a separate effect reacting to `isTyping` -- that would
    // be an extra render just to clear text before the typewriter effect
    // below ever sees it.
    if (upcoming === "typing-goal" || upcoming === "typing-reply") {
      setTyped("");
    }
    setFrame(upcoming);
  }

  // Clock-driven frames. The two typewriter frames carry ms: 0 and are
  // advanced by the typewriter effect below instead.
  //
  // `next` is deliberately left out of the deps array. It's redefined on
  // every render, so including it would re-run this effect -- clearing and
  // rescheduling the timer -- on any render at all, not just ones where
  // `frame`/`reducedMotion`/`isTyping` actually changed. That would starve
  // the "slotting" frame in particular: its own effect below bumps
  // `slotsIn` every 190ms while this frame's 1900ms timer is pending, and
  // each of those renders would reset the timer before it ever fired.
  useEffect(() => {
    if (reducedMotion || isTyping) return;
    const ms = TIMELINE[indexOf(frame)].ms;
    const timer = setTimeout(next, ms);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- see comment above
  }, [frame, reducedMotion, isTyping]);

  // Typewriter. Appends a character at a time, then hands control back to
  // the timeline once the line is complete. Same reasoning as above for
  // omitting `next`.
  useEffect(() => {
    if (reducedMotion || !isTyping) return;
    if (typed.length >= typingTarget.length) {
      const hold = setTimeout(next, 320);
      return () => clearTimeout(hold);
    }
    const timer = setTimeout(() => {
      setTyped(typingTarget.slice(0, typed.length + 1));
    }, TYPE_SPEED_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- see comment above
  }, [typed, isTyping, typingTarget, reducedMotion]);

  // Blocks landing one after another during the slotting frame.
  useEffect(() => {
    if (reducedMotion || frame !== "slotting") return;
    if (slotsIn >= SLOTS.length) return;
    const timer = setTimeout(() => setSlotsIn((n) => n + 1), 190);
    return () => clearTimeout(timer);
  }, [frame, slotsIn, reducedMotion]);

  // Reduced motion (and the server render) shows the finished state: the
  // full transcript, all seven blocks placed, nothing in flight.
  const shown: Frame = reducedMotion ? "done" : frame;
  const visibleSlots = reducedMotion ? SLOTS.length : slotsIn;
  const goalBubble = shown === "typing-goal" ? typed : GOAL_TEXT;
  const replyBubble = shown === "typing-reply" ? typed : REPLY_TEXT;

  return (
    <div className="relative w-full max-w-md">
      {/* Glow behind the card. Purely decorative, hence aria-hidden. */}
      <div
        aria-hidden
        className="absolute -inset-6 -z-10 rounded-[2rem] bg-gradient-to-br from-emerald-200/45 via-transparent to-violet-200/45 blur-2xl dark:from-emerald-500/12 dark:to-violet-500/12"
      />

      <div className="overflow-hidden rounded-2xl border border-zinc-200/90 bg-white/90 shadow-xl shadow-zinc-900/5 backdrop-blur-sm dark:border-zinc-800 dark:bg-zinc-950/90 dark:shadow-black/40">
        <div className="flex items-center gap-2.5 border-b border-zinc-100 px-4 py-3 dark:border-zinc-900">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-black text-[10px] font-semibold text-white dark:bg-white dark:text-black">
            S
          </span>
          <span className="text-xs font-medium text-zinc-600 dark:text-zinc-300">
            Weekly session
          </span>
          <span className="ml-auto flex items-center gap-1.5 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            Athlete
          </span>
        </div>

        {/* Fixed min-height so the page never reflows as frames appear or
            the loop restarts. */}
        <div
          key={cycle}
          className="flex min-h-[23rem] flex-col gap-2.5 p-4"
          aria-label="Demo: Sundae turning a goal into seven scheduled calendar blocks"
          role="img"
        >
          <Bubble side="user">
            {goalBubble}
            {shown === "typing-goal" && <Caret />}
          </Bubble>

          {shown === "thinking" && <Thinking />}

          {atLeast(shown, "question") && (
            <Bubble side="agent">
              Which single action would move that the most this week?
            </Bubble>
          )}

          {atLeast(shown, "typing-reply") && (
            <Bubble side="user">
              {replyBubble}
              {shown === "typing-reply" && <Caret />}
            </Bubble>
          )}

          {atLeast(shown, "classify") && (
            <div className="animate-[pop-in_0.35s_ease-out] self-start rounded-xl border border-violet-200 bg-violet-50/70 px-3 py-2 dark:border-violet-900/70 dark:bg-violet-950/40">
              <div className="flex items-center gap-2">
                <span className="rounded-md bg-violet-600 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                  Habit
                </span>
                <span className="text-xs text-violet-900 dark:text-violet-300">
                  recurring · 7 blocks this week
                </span>
              </div>
            </div>
          )}

          {atLeast(shown, "slotting") && (
            <div className="animate-[fade-in-up_0.3s_ease-out] rounded-xl border border-zinc-200 bg-zinc-50/80 p-2.5 dark:border-zinc-800 dark:bg-zinc-900/50">
              <p className="mb-2 px-0.5 text-[10px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                Reading your open time
              </p>
              <div className="grid grid-cols-7 gap-1">
                {SLOTS.map((slot, i) => (
                  <div
                    key={slot.day}
                    className="flex flex-col items-center gap-1"
                  >
                    <span className="text-[9px] font-medium text-zinc-400 dark:text-zinc-500">
                      {slot.day}
                    </span>
                    <div className="relative h-11 w-full rounded-md border border-dashed border-zinc-300 dark:border-zinc-700">
                      {i < visibleSlots && (
                        <>
                          <span
                            aria-hidden
                            className="land-pulse absolute inset-0 rounded-md bg-emerald-400/40"
                          />
                          <span
                            className="block-drop absolute inset-0 flex items-center justify-center rounded-md bg-emerald-500 text-[8px] font-semibold leading-tight text-white"
                            style={{ animationDelay: "0ms" }}
                          >
                            {slot.time.replace(" AM", "")}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {shown === "confirm" && (
            <div className="flex animate-[pop-in_0.3s_ease-out] items-center gap-2">
              <span className="rounded-full bg-black px-3 py-1.5 text-xs font-medium text-white dark:bg-white dark:text-black">
                Add 7 blocks
              </span>
              <span className="rounded-full border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-600 dark:border-zinc-700 dark:text-zinc-400">
                Adjust times
              </span>
            </div>
          )}

          {shown === "done" && (
            <div className="flex animate-[pop-in_0.3s_ease-out] items-center gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50/80 px-3 py-2.5 dark:border-emerald-900/70 dark:bg-emerald-950/40">
              <Check />
              <div className="flex flex-col">
                <span className="text-xs font-semibold text-emerald-900 dark:text-emerald-300">
                  On your calendar
                </span>
                <span className="text-[11px] text-emerald-700/90 dark:text-emerald-400/80">
                  Athlete scorecard now tracking 0 / 7 this week
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function Bubble({
  side,
  children,
}: {
  side: "user" | "agent";
  children: React.ReactNode;
}) {
  const user = side === "user";
  return (
    <div
      className={`animate-[fade-in-up_0.3s_ease-out] max-w-[85%] rounded-2xl px-3.5 py-2 text-sm ${
        user
          ? "self-end rounded-br-sm bg-black text-white dark:bg-white dark:text-black"
          : "self-start rounded-bl-sm bg-zinc-100 text-black dark:bg-zinc-800 dark:text-zinc-100"
      }`}
    >
      {children}
    </div>
  );
}

function Caret() {
  return (
    <span
      aria-hidden
      className="caret ml-0.5 inline-block h-3.5 w-[2px] translate-y-[2px] bg-current"
    />
  );
}

function Thinking() {
  return (
    <span className="shimmer-text self-start bg-gradient-to-r from-zinc-400 via-zinc-900 to-zinc-400 px-1 text-xs font-medium dark:from-zinc-600 dark:via-zinc-200 dark:to-zinc-600">
      Reading last week and your calendar…
    </span>
  );
}

function Check() {
  return (
    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500">
      <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" aria-hidden>
        <path
          d="M5 10.5l3.2 3.2L15 7"
          fill="none"
          stroke="white"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}
