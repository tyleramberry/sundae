"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useReducedMotion } from "@/lib/hooks/useReducedMotion";

// useLayoutEffect warns if it runs during SSR (there's no browser layout to
// read on the server). This component always has a real client to
// hydrate into, so the standard swap applies: useEffect on the server
// (where it's a no-op either way -- SSR never runs effects), the real
// layout effect once there's a DOM.
const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

// The landing page's scroll centerpiece: a tall section with a pinned
// panel inside it, where an empty week fills in block by block as you
// scroll. Scrubbed by scroll position rather than played on a timer, so
// the visitor controls the pace -- scroll back up and the week empties
// again.
//
// Why a scroll handler and not an IntersectionObserver: IO reports that a
// threshold was crossed, not how far through an element you are, and this
// needs continuous progress. The handler is passive and rAF-coalesced, and
// the only thing it writes is one number, so a scroll never triggers more
// than one render per frame.
//
// Reduced motion gets the finished week immediately, with no pinning and
// no scrub -- the section collapses to a normal-height block.

type Role = "founder" | "parent" | "athlete";

type Block = {
  role: Role;
  /** 0 = Monday. */
  day: number;
  /** 1-indexed row into ROW_LABELS. */
  row: number;
  label: string;
};

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const ROW_LABELS = ["6a", "8a", "10a", "12p", "2p", "4p", "6p", "8p"];

// One realistic week: an every-morning habit that fans out into seven
// blocks, plus one-off work under the other two roles. Fifteen blocks
// total, which is exactly the denominator the KPI example in
// docs/MVP-spec.md walks through.
const BLOCKS: Block[] = [
  { role: "athlete", day: 0, row: 1, label: "Workout" },
  { role: "founder", day: 0, row: 4, label: "Investor update" },
  { role: "athlete", day: 1, row: 1, label: "Workout" },
  { role: "parent", day: 1, row: 7, label: "Dinner, phones away" },
  { role: "athlete", day: 2, row: 1, label: "Workout" },
  { role: "founder", day: 2, row: 3, label: "Seed round calls" },
  { role: "athlete", day: 3, row: 1, label: "Workout" },
  { role: "founder", day: 3, row: 5, label: "1:1 with cofounder" },
  { role: "parent", day: 3, row: 7, label: "Reading together" },
  { role: "athlete", day: 4, row: 1, label: "Workout" },
  { role: "founder", day: 4, row: 4, label: "Ship pricing page" },
  { role: "athlete", day: 5, row: 2, label: "Long run" },
  { role: "parent", day: 5, row: 6, label: "Plan the trip" },
  { role: "athlete", day: 6, row: 2, label: "Recovery walk" },
  { role: "parent", day: 6, row: 7, label: "Family dinner" },
];

const ROLES: { id: Role; name: string; dot: string; block: string }[] = [
  {
    id: "founder",
    name: "Founder",
    dot: "bg-violet-500",
    block: "bg-violet-500 border-violet-600/40",
  },
  {
    id: "parent",
    name: "Parent",
    dot: "bg-amber-500",
    block: "bg-amber-500 border-amber-600/40",
  },
  {
    id: "athlete",
    name: "Athlete",
    dot: "bg-emerald-500",
    block: "bg-emerald-500 border-emerald-600/40",
  },
];

const STEPS = [
  {
    title: "Your roles, not your inbox",
    body: "You name the hats you actually wear. Every question Sundae asks is scoped to one of them, so nothing competes for the same hour by accident.",
  },
  {
    title: "Each goal gets drilled down",
    body: "“Work out every morning” isn't a task — it's seven. Sundae reads the cadence out of how you said it and plans the blocks that follow from it.",
  },
  {
    title: "Then it finds the room",
    body: "Sundae reads your real calendar, fits each block into open time, and hands the whole week back for one confirmation.",
  },
];

// Scroll window over which blocks land, as a fraction of the section's
// scrollable distance. The lead-in lets the panel settle before anything
// moves; the tail leaves the finished week on screen for a beat.
const FILL_START = 0.1;
const FILL_END = 0.76;

function clamp01(n: number) {
  return Math.min(1, Math.max(0, n));
}

export default function WeekAssembly() {
  // `false`: assume motion is fine unless told otherwise, for the initial
  // server render and the first client paint. Unlike AgentDemo, this
  // component's two states are structurally different layouts (pinned
  // scroll runway vs. plain stacked block) rather than two frames of the
  // same one -- so guessing wrong here doesn't just skip an animation, it
  // reflows the whole section and jumps everything below it. Reduced-
  // motion visitors are a small minority; optimizing the guess for
  // everyone else means only that minority ever sees the one-time
  // settle right after mount, instead of every visitor seeing it.
  const reducedMotion = useReducedMotion(false);
  const sectionRef = useRef<HTMLDivElement>(null);
  // `null` means "not measured yet" -- distinct from `0` (measured, and
  // the section is above/below the fold). Both the server render and a
  // visitor with JS off stay in this state forever, so it has to resolve
  // to something coherent on its own: see the `fill` fallback below.
  const [progress, setProgress] = useState<number | null>(null);

  // A layout effect, not a plain effect, and specifically for the reason
  // that distinction exists: it commits synchronously before the browser
  // paints, so the very first frame a JS-enabled visitor sees already has
  // the real scroll-derived fill -- never the fallback-full frame below
  // flashing before snapping down to wherever they actually are.
  useIsomorphicLayoutEffect(() => {
    if (reducedMotion) return;
    const el = sectionRef.current;
    if (!el) return;

    let frame = 0;

    const measure = () => {
      frame = 0;
      const rect = el.getBoundingClientRect();
      // Distance the section travels while its pinned child is stuck.
      const travel = rect.height - window.innerHeight;
      if (travel <= 0) {
        setProgress(1);
        return;
      }
      setProgress(clamp01(-rect.top / travel));
    };

    const onScroll = () => {
      // Coalesce to one measurement per frame -- scroll fires far more
      // often than the screen repaints.
      if (frame) return;
      frame = requestAnimationFrame(measure);
    };

    measure();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [reducedMotion]);

  // No measurement yet (SSR, no-JS, or the one frame before the layout
  // effect above runs) reads as "fully filled" rather than "empty" --  a
  // finished week is a coherent, complete thing to show with no JS ever
  // running; an empty grid forever would just look broken.
  const fill =
    reducedMotion || progress === null
      ? 1
      : clamp01((progress - FILL_START) / (FILL_END - FILL_START));
  const placed = Math.round(fill * BLOCKS.length);
  const activeStep = fill >= 0.66 ? 2 : fill >= 0.3 ? 1 : 0;

  // One JSX tree for both states -- only classes/styles branch on
  // `reducedMotion`, not the element structure -- so a post-hydration
  // flip (see the hook comment above) updates styling in place instead of
  // tearing down and remounting a differently-shaped tree.
  return (
    <section
      ref={sectionRef}
      className="relative border-y border-zinc-200 bg-white dark:border-zinc-900 dark:bg-zinc-950"
      // The extra height is the scroll runway the pinned panel scrubs
      // through when motion is allowed; reduced motion drops the section
      // back to its natural (auto) height as ordinary stacked content.
      style={reducedMotion ? undefined : { height: "min(340vh, 2600px)" }}
    >
      <div
        className={
          reducedMotion
            ? "flex flex-col px-6 py-20 sm:px-10"
            : "sticky top-0 flex h-dvh flex-col justify-center overflow-hidden px-6 sm:px-10"
        }
      >
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 lg:flex-row lg:items-center lg:gap-16">
          <div className="flex flex-col gap-6 lg:flex-1">
            <SectionHeading />

            {/* Desktop: all three steps, the active one lit. Mobile has no
                room for that, so it shows only the active step and swaps
                the text as you scroll (or, under reduced motion, just
                shows the last one, matching the fully-filled grid). */}
            <div className="hidden flex-col gap-5 lg:flex">
              {STEPS.map((s, i) => (
                <StepCard
                  key={s.title}
                  step={s}
                  index={i}
                  active={i === activeStep}
                />
              ))}
            </div>
            <div className="lg:hidden">
              <StepCard
                step={STEPS[activeStep]}
                index={activeStep}
                active
                compact={!reducedMotion}
              />
            </div>

            <ProgressRail active={activeStep} />
          </div>

          <div className="lg:flex-1">
            <WeekGrid placed={placed} reducedMotion={reducedMotion} />
          </div>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------

function SectionHeading() {
  return (
    <div className="flex flex-col gap-3">
      <span className="text-xs font-medium uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
        One sitting a week
      </span>
      <h2 className="text-3xl font-semibold leading-tight tracking-tight text-black dark:text-zinc-50 sm:text-4xl">
        Watch a week build itself.
      </h2>
    </div>
  );
}

function StepCard({
  step,
  index,
  active,
  compact = false,
}: {
  step: (typeof STEPS)[number];
  index: number;
  active: boolean;
  compact?: boolean;
}) {
  return (
    <div
      className={`flex gap-4 rounded-xl border p-4 transition-all duration-500 ${
        active
          ? "border-zinc-300 bg-zinc-50 opacity-100 dark:border-zinc-700 dark:bg-zinc-900/60"
          : "border-transparent opacity-40"
      } ${compact ? "min-h-[8.5rem]" : ""}`}
    >
      <span
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-colors duration-500 ${
          active
            ? "bg-black text-white dark:bg-white dark:text-black"
            : "bg-zinc-200 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-500"
        }`}
      >
        {index + 1}
      </span>
      <div className="flex flex-col gap-1">
        <h3 className="text-base font-semibold text-black dark:text-zinc-50">
          {step.title}
        </h3>
        <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-400">
          {step.body}
        </p>
      </div>
    </div>
  );
}

function ProgressRail({ active }: { active: number }) {
  return (
    <div className="flex gap-1.5" aria-hidden>
      {STEPS.map((s, i) => (
        <span
          key={s.title}
          className={`h-1 flex-1 rounded-full transition-colors duration-500 ${
            i <= active
              ? "bg-black dark:bg-white"
              : "bg-zinc-200 dark:bg-zinc-800"
          }`}
        />
      ))}
    </div>
  );
}

function WeekGrid({
  placed,
  reducedMotion,
}: {
  placed: number;
  reducedMotion: boolean;
}) {
  const counts = ROLES.map((role) => ({
    ...role,
    total: BLOCKS.filter((b) => b.role === role.id).length,
    done: BLOCKS.slice(0, placed).filter((b) => b.role === role.id).length,
  }));

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl border border-zinc-200 bg-zinc-50/80 p-3 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/40 sm:p-4">
        <div className="mb-2 flex items-center justify-between px-1">
          <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
            Your week
          </span>
          <span
            className="text-xs font-medium tabular-nums text-zinc-500 dark:text-zinc-400"
            aria-live="off"
          >
            {placed} / {BLOCKS.length} blocks
          </span>
        </div>

        <div className="flex gap-1.5">
          {/* Time gutter */}
          <div className="flex w-6 shrink-0 flex-col pt-5">
            {ROW_LABELS.map((label) => (
              <span
                key={label}
                className="flex h-7 items-start text-[9px] leading-none text-zinc-400 dark:text-zinc-600 sm:h-8"
              >
                {label}
              </span>
            ))}
          </div>

          <div className="min-w-0 flex-1">
            <div className="mb-1 grid grid-cols-7 gap-1">
              {DAYS.map((d) => (
                <span
                  key={d}
                  className="text-center text-[10px] font-medium text-zinc-500 dark:text-zinc-400"
                >
                  {d}
                </span>
              ))}
            </div>

            <div
              className="grid grid-cols-7 gap-1"
              style={{
                gridTemplateRows: `repeat(${ROW_LABELS.length}, minmax(1.75rem, auto))`,
              }}
            >
              {/* Empty cells, drawn first so blocks paint over them. */}
              {DAYS.map((day, d) =>
                ROW_LABELS.map((_, r) => (
                  <div
                    key={`${day}-${r}`}
                    className="rounded-[5px] bg-white ring-1 ring-inset ring-zinc-200/70 dark:bg-zinc-950/40 dark:ring-zinc-800/70"
                    style={{ gridColumn: d + 1, gridRow: r + 1 }}
                  />
                )),
              )}

              {/* Keyed by content, not index, so a block already on screen
                  keeps its DOM node as `placed` grows -- `.block-drop`'s
                  CSS animation only fires once, on mount, so only blocks
                  newly entering the slice animate; ones already placed sit
                  still instead of re-triggering every scroll frame. */}
              {BLOCKS.slice(0, placed).map((block) => {
                const role = ROLES.find((r) => r.id === block.role);
                return (
                  <div
                    key={`${block.day}-${block.row}-${block.label}`}
                    className={`relative flex items-center justify-center overflow-hidden rounded-[5px] border px-1 text-[8px] font-semibold leading-tight text-white sm:text-[9px] ${
                      role?.block ?? ""
                    } ${reducedMotion ? "" : "block-drop"}`}
                    style={{ gridColumn: block.day + 1, gridRow: block.row }}
                    title={`${role?.name}: ${block.label}`}
                  >
                    <span className="truncate px-0.5">{block.label}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {counts.map((role) => (
          <div
            key={role.id}
            className="flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 py-1.5 dark:border-zinc-800 dark:bg-zinc-950"
          >
            <span className={`h-2 w-2 rounded-full ${role.dot}`} />
            <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
              {role.name}
            </span>
            <span className="text-xs tabular-nums text-zinc-400 dark:text-zinc-500">
              {role.done}/{role.total}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
