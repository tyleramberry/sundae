"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import FocusShell from "@/components/FocusShell";
import MeltWord from "@/components/MeltWord";

// New onboarding (Day 7 redesign): survey -> live demo -> hype -> first
// weekly session. Freemium: no card step -- the first three planning sessions
// are free (src/lib/weeklySession/freeTier.ts). Replaces the old chat-transcript
// flow that used to capture roles/goals here and end on "Your onboard."
//
// What changed and why, briefly (full rationale in docs/onboarding-flow.md):
// - The survey questions below are context/marketing signal only -- they
//   never touch `onboarding_answers`, the table the planning engine reads.
// - The *functional* roles + goals capture (the old chat engine) moved to
//   the weekly session's new Stage 0 (see /weekly-session) -- it runs the
//   first time a user starts a session with no `onboarding_answers` row
//   yet. Onboarding itself no longer blocks on that conversation.
// - No skip on any screen -- same "no skip option" lesson pulled from
//   studying Wispr Flow's onboarding: removing the option to bail early
//   means nobody exits having only half-learned the product.
export default function OnboardingPage() {
  const router = useRouter();
  const [screenIndex, setScreenIndex] = useState(0);
  const screen = SCREEN_ORDER[screenIndex];
  const [finishing, setFinishing] = useState(false);

  const [heardFrom, setHeardFrom] = useState<string | null>(null);
  const [roles, setRoles] = useState<string[]>([]);
  const [motivations, setMotivations] = useState<string[]>([]);
  const [demoResult, setDemoResult] = useState<DemoResult | null>(null);

  // Auth + "already finished" is enforced by src/app/onboarding/layout.tsx.
  // Incremental survey answers stay fire-and-forget; the hype CTA awaits
  // completed: true so logout + login cannot race the persist.
  function saveSurveyPatch(patch: Record<string, unknown>) {
    void fetch("/api/onboarding/survey", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    }).catch((err) => console.error("Failed to save survey answer:", err));
  }

  async function finishOnboarding() {
    if (finishing) return;
    setFinishing(true);
    try {
      await fetch("/api/onboarding/survey", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          completed: true,
          // Re-send the demo text so completion is durable even if the
          // earlier fire-and-forget save dropped, and even before the
          // completed_at column is migrated (routing also keys off this).
          ...(demoResult?.goalText ? { demoGoalText: demoResult.goalText } : {}),
        }),
      });
    } catch (err) {
      console.error("Failed to mark onboarding complete:", err);
    }
    router.push("/weekly-session");
  }

  function goNext() {
    setScreenIndex((i) => Math.min(i + 1, SCREEN_ORDER.length - 1));
  }

  // The last screen is a moment, not a form, so it goes dark like the
  // landing page's closing section.
  const night = screen === "hype";

  return (
    <FocusShell
      tone={night ? "night" : "canvas"}
      aside={
        <span
          className={`font-mono text-xs tabular-nums ${
            night ? "text-white/50" : "text-ink-secondary"
          }`}
        >
          {String(screenIndex + 1).padStart(2, "0")} / {String(SCREEN_ORDER.length).padStart(2, "0")}
        </span>
      }
    >
      <ProgressBar current={screenIndex} total={SCREEN_ORDER.length} night={night} />
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col pt-10 sm:pt-16">
        {screen === "heard-from" && (
          <>
            <SingleSelectScreen
              note="No card needed. Your first three planning sessions are free."
              title="How did you hear about Sundae?"
              subtitle="Helps us know what's actually working."
              options={HEARD_FROM_OPTIONS}
              value={heardFrom}
              onChange={setHeardFrom}
              onContinue={() => {
                if (!heardFrom) return;
                saveSurveyPatch({ heardFrom });
                goNext();
              }}
            />
          </>
        )}

        {screen === "roles" && (
          <MultiSelectScreen
            title="What roles do you fill every week?"
            subtitle="Pick as many as apply — just context for us, nothing to set up yet."
            options={ROLE_OPTIONS}
            value={roles}
            onChange={setRoles}
            onContinue={() => {
              if (roles.length === 0) return;
              saveSurveyPatch({ weeklyRoles: roles });
              goNext();
            }}
          />
        )}

        {screen === "motivations" && (
          <MultiSelectScreen
            title="What's Sundae going to solve for you?"
            subtitle="Select everything that applies."
            options={MOTIVATION_OPTIONS}
            value={motivations}
            onChange={setMotivations}
            onContinue={() => {
              if (motivations.length === 0) return;
              saveSurveyPatch({ goalsForSundae: motivations });
              goNext();
            }}
          />
        )}

        {screen === "demo" && (
          <DemoScreen
            onDone={(result) => {
              saveSurveyPatch({ demoGoalText: result.goalText });
              setDemoResult(result);
              goNext();
            }}
          />
        )}

        {screen === "hype" && demoResult && (
          <HypeScreen
            result={demoResult}
            finishing={finishing}
            onContinue={() => void finishOnboarding()}
          />
        )}
      </div>
    </FocusShell>
  );
}

// ---------------------------------------------------------------------------
// Content

type Screen = "heard-from" | "roles" | "motivations" | "demo" | "hype";
const SCREEN_ORDER: Screen[] = ["heard-from", "roles", "motivations", "demo", "hype"];

const HEARD_FROM_OPTIONS = [
  "Twitter / X",
  "Instagram or TikTok",
  "YouTube or a podcast",
  "Google search",
  "A friend or colleague",
  "Product Hunt",
  "Other",
];

// 16 presets -- survey/context only, never written to onboarding_answers.
const ROLE_OPTIONS = [
  "Founder",
  "Manager",
  "Employee",
  "Freelancer",
  "Parent",
  "Partner or spouse",
  "Student",
  "Athlete",
  "Caregiver",
  "Volunteer",
  "Board member",
  "Side-hustler",
  "Homeowner",
  "Mentor",
  "Creator",
  "Community member",
];

const MOTIVATION_OPTIONS = [
  "Productivity",
  "Accountability",
  "Time-saving",
  "Motivation",
  "Planning my week",
  "Organization",
  "Time-saving during my planning session",
  "Consistency",
  "Clarity on priorities",
  "Less overwhelm",
  "Actually hitting my goals",
  "Work-life balance",
];

// ---------------------------------------------------------------------------
// Shared bits

// One continuous bar rather than dots: it fills with strawberry as you go,
// and the step count lives in the top bar.
function ProgressBar({
  current,
  total,
  night,
}: {
  current: number;
  total: number;
  night: boolean;
}) {
  return (
    <div
      className={`h-1 w-full overflow-hidden rounded-full ${
        night ? "bg-white/10" : "bg-ink/10"
      }`}
      role="progressbar"
      aria-valuemin={1}
      aria-valuemax={total}
      aria-valuenow={current + 1}
      aria-label="Onboarding progress"
    >
      <div
        className="h-full rounded-full bg-strawberry transition-[width] duration-700 ease-[cubic-bezier(0.16,1,0.3,1)]"
        style={{ width: `${((current + 1) / total) * 100}%` }}
      />
    </div>
  );
}

function Chip({
  label,
  selected,
  onClick,
  index,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
  /** Staggers the chips' entrance. */
  index: number;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      style={{ animationDelay: `${index * 25}ms` }}
      className={`inline-flex animate-[fade-in-up_0.4s_ease-out_backwards] items-center gap-2 rounded-full border px-4 py-2.5 text-left text-[15px] font-medium transition duration-200 active:scale-95 sm:px-5 sm:py-3 sm:text-base ${
        selected
          ? "border-strawberry bg-strawberry text-night"
          : "border-ink/15 text-ink hover:border-ink/40"
      }`}
    >
      {label}
      {selected && (
        <svg
          viewBox="0 0 20 20"
          className="h-4 w-4 animate-[pop-in_0.25s_ease-out]"
          aria-hidden
        >
          <path
            d="M4.5 10.5 8.2 14 15.5 6.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </button>
  );
}

function ContinueButton({
  disabled,
  onClick,
  children = "Continue",
  tone = "ink",
}: {
  disabled: boolean;
  onClick: () => void;
  children?: React.ReactNode;
  tone?: "ink" | "strawberry";
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`group inline-flex items-center gap-2 self-start rounded-full px-7 py-3.5 text-base font-semibold transition hover:-translate-y-0.5 active:translate-y-0 disabled:pointer-events-none disabled:opacity-30 ${
        tone === "strawberry"
          ? "bg-strawberry text-night hover:brightness-110"
          : "bg-ink text-white hover:bg-black"
      }`}
    >
      {children}
      <span
        aria-hidden
        className="transition-transform duration-200 group-hover:translate-x-0.5"
      >
        →
      </span>
    </button>
  );
}

function ScreenTitle({
  title,
  subtitle,
}: {
  title: React.ReactNode;
  subtitle: string;
}) {
  return (
    <div className="animate-[fade-in-up_0.45s_ease-out]">
      <h1 className="display text-[2.75rem] sm:text-7xl">{title}</h1>
      <p className="mt-4 max-w-xl text-lg leading-8 text-ink-secondary">
        {subtitle}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Survey screens

function SingleSelectScreen({
  title,
  subtitle,
  note,
  options,
  value,
  onChange,
  onContinue,
}: {
  title: string;
  subtitle: string;
  note?: string;
  options: string[];
  value: string | null;
  onChange: (v: string) => void;
  onContinue: () => void;
}) {
  return (
    <div className="flex flex-1 flex-col gap-10">
      <ScreenTitle title={title} subtitle={subtitle} />
      <div className="flex flex-wrap gap-2.5">
        {options.map((opt, i) => (
          <Chip
            key={opt}
            index={i}
            label={opt}
            selected={value === opt}
            onClick={() => onChange(opt)}
          />
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 pt-2">
        <ContinueButton disabled={!value} onClick={onContinue} />
        {note && <p className="text-sm text-ink-secondary">{note}</p>}
      </div>
    </div>
  );
}

function MultiSelectScreen({
  title,
  subtitle,
  options,
  value,
  onChange,
  onContinue,
}: {
  title: string;
  subtitle: string;
  options: string[];
  value: string[];
  onChange: (v: string[]) => void;
  onContinue: () => void;
}) {
  function toggle(opt: string) {
    onChange(value.includes(opt) ? value.filter((v) => v !== opt) : [...value, opt]);
  }

  return (
    <div className="flex flex-1 flex-col gap-10">
      <ScreenTitle title={title} subtitle={subtitle} />
      <div className="flex flex-wrap gap-2.5">
        {options.map((opt, i) => (
          <Chip
            key={opt}
            index={i}
            label={opt}
            selected={value.includes(opt)}
            onClick={() => toggle(opt)}
          />
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 pt-2">
        <ContinueButton disabled={value.length === 0} onClick={onContinue} />
        <p className="font-mono text-xs text-ink-secondary" aria-live="polite">
          {value.length === 0 ? "Pick at least one" : `${value.length} picked`}
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Demo screen — the whole point of this redesign. One real input (the
// user's own words), everything after that is a scripted, deterministic
// animation — not a live model call — per the "reliable on the most
// important screen" call made when this redesign was planned. Still reads
// as responsive because the derived action item is templated off what the
// user actually typed, not a generic canned example.

type DemoResult = {
  goalText: string;
  actionText: string;
  slotLabel: string;
  elapsedSeconds: number;
  blockMinutes: number;
};

type DemoPhase =
  | "typing"
  | "goal-shown"
  | "ai-thinking-1"
  | "ai-reframe"
  | "consensus"
  | "ai-thinking-2"
  | "action-item"
  | "calendar-block"
  | "counter"
  | "ready";

const PHASE_AFTER: Partial<Record<DemoPhase, { next: DemoPhase; delayMs: number }>> = {
  "goal-shown": { next: "ai-thinking-1", delayMs: 550 },
  "ai-thinking-1": { next: "ai-reframe", delayMs: 900 },
  "ai-reframe": { next: "consensus", delayMs: 1100 },
  consensus: { next: "ai-thinking-2", delayMs: 650 },
  "ai-thinking-2": { next: "action-item", delayMs: 850 },
  "action-item": { next: "calendar-block", delayMs: 900 },
  "calendar-block": { next: "counter", delayMs: 700 },
  counter: { next: "ready", delayMs: 400 },
};

const BLOCK_MINUTES = 45;

// Small, honest heuristic library so the "drilled down" action item feels
// responsive to what the user actually typed without a live model call.
// Falls through to a generic-but-still-personalized template if nothing
// matches — never fabricates specifics the user didn't imply.
function deriveActionItem(goalText: string): string {
  const g = goalText.toLowerCase();
  const has = (...words: string[]) => words.some((w) => g.includes(w));

  if (has("shape", "fit", "health", "workout", "gym", "run", "exercise")) {
    return "Go for a 30-minute walk or workout";
  }
  if (has("business", "startup", "round", "investor", "funding", "revenue", "client", "customer")) {
    return "Follow up with two people who could move this forward";
  }
  if (has("family", "kids", "kid", "partner", "spouse", "wife", "husband")) {
    return "Block uninterrupted time with them, phone away";
  }
  if (has("read", "book", "learn", "course", "study")) {
    return "Set aside 30 minutes and just start";
  }
  if (has("write", "blog", "content", "post", "video", "film")) {
    return "Draft the first section, even rough";
  }
  if (has("clean", "organize", "declutter", "house", "apartment")) {
    return "Pick one room and set a 25-minute timer";
  }
  return `Take the first concrete step on "${goalText.trim()}"`;
}

function nextDemoSlot(): { start: Date; end: Date; label: string } {
  const start = new Date();
  start.setDate(start.getDate() + 1);
  start.setHours(10, 0, 0, 0);
  const end = new Date(start.getTime() + BLOCK_MINUTES * 60_000);
  const day = start.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  const time = (d: Date) => d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return { start, end, label: `${day}, ${time(start)}–${time(end)}` };
}

function TypingDots() {
  return (
    <div className="flex max-w-[80%] items-center gap-1 self-start rounded-2xl rounded-bl-sm bg-white/10 px-4 py-3.5">
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-white/60 [animation-delay:-0.3s]" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-white/60 [animation-delay:-0.15s]" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-white/60" />
    </div>
  );
}

function DemoScreen({ onDone }: { onDone: (result: DemoResult) => void }) {
  const [input, setInput] = useState("");
  const [goalText, setGoalText] = useState<string | null>(null);
  const [phase, setPhase] = useState<DemoPhase>("typing");
  // Read only inside effects/handlers, never during render, so this one's
  // fine as a ref -- `slot` below is read during render (it's shown in the
  // JSX), so that one has to be state instead (see react-hooks/refs).
  const startedAtRef = useRef<number | null>(null);
  const [slot, setSlot] = useState<{ start: Date; end: Date; label: string } | null>(null);

  // Drives the scripted sequence forward automatically once a phase has a
  // scheduled successor — a single small state machine instead of one
  // setTimeout chain, so it cleans up correctly on unmount.
  useEffect(() => {
    const step = PHASE_AFTER[phase];
    if (!step) return;
    const t = setTimeout(() => setPhase(step.next), step.delayMs);
    return () => clearTimeout(t);
  }, [phase]);

  useEffect(() => {
    if (phase === "ready" && goalText) {
      const elapsedSeconds = startedAtRef.current
        ? Math.max(1, Math.round((performance.now() - startedAtRef.current) / 1000))
        : 8;
      onDone({
        goalText,
        actionText: deriveActionItem(goalText),
        slotLabel: slot?.label ?? "",
        elapsedSeconds,
        blockMinutes: BLOCK_MINUTES,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  function submit(e?: React.FormEvent) {
    e?.preventDefault();
    const trimmed = input.trim();
    if (!trimmed) return;
    startedAtRef.current = performance.now();
    setSlot(nextDemoSlot());
    setGoalText(trimmed);
    setPhase("goal-shown");
  }

  if (phase === "typing") {
    return (
      <div className="flex flex-1 flex-col gap-10">
        <ScreenTitle
          title={<>Now watch it work.</>}
          subtitle="Type one real thing that’s on your mind this week. Big or small."
        />
        <form onSubmit={submit} className="flex flex-col gap-8">
          {/* One big underlined line, not a boxed field: the answer is the
              hero of this screen. */}
          <input
            autoFocus
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="get back in shape"
            aria-label="Something on your mind this week"
            className="display w-full border-b-2 border-ink/20 bg-transparent pb-3 text-4xl text-ink caret-strawberry outline-none transition-colors placeholder:text-ink/20 focus:border-strawberry sm:text-6xl"
          />
          <p className="-mt-4 text-sm text-ink-secondary">
            Or try: close the seed round, more time with my kids, finish the
            thesis.
          </p>
          <div className="pt-2">
            <ContinueButton disabled={!input.trim()} onClick={() => submit()}>
              Watch it happen
            </ContinueButton>
          </div>
        </form>
      </div>
    );
  }

  const action = goalText ? deriveActionItem(goalText) : "";

  return (
    <div className="flex flex-1 flex-col gap-8">
      <ScreenTitle
        title="Watch it happen."
        subtitle="The same drill-down Sundae runs on every goal: vague idea to a time on your calendar."
      />

      {/* The demo runs in the landing page's dark "product" surface, with
          the role-block colors: strawberry for you, vanilla for the action,
          pistachio for the calendar block. */}
      <div className="flex min-h-[22rem] flex-col justify-end gap-3 rounded-[1.75rem] bg-night p-5 text-white sm:p-7">
        {/* User's goal */}
        {phaseAtLeast(phase, "goal-shown") && (
          <div className="flex flex-col items-end gap-1.5">
            <div className="max-w-[80%] animate-[fade-in-up_0.3s_ease-out] self-end rounded-2xl rounded-br-sm bg-strawberry px-4 py-2.5 text-[15px] font-medium text-night">
              {goalText}
            </div>
            {phaseAtLeast(phase, "consensus") && (
              <span className="animate-[pop-in_0.3s_ease-out] font-mono text-[11px] text-white/50">
                that&rsquo;s the one ✓
              </span>
            )}
          </div>
        )}

        {phase === "ai-thinking-1" && <TypingDots />}

        {/* AI reframe */}
        {phaseAtLeast(phase, "ai-reframe") && (
          <div className="max-w-[80%] animate-[fade-in-up_0.3s_ease-out] self-start rounded-2xl rounded-bl-sm bg-white/10 px-4 py-2.5 text-[15px] text-white">
            If you could only get one thing done this week toward that, what
            would it be?
          </div>
        )}

        {phase === "ai-thinking-2" && <TypingDots />}

        {/* Concrete action item */}
        {phaseAtLeast(phase, "action-item") && (
          <div className="max-w-[85%] animate-[pop-in_0.35s_ease-out] self-start rounded-2xl bg-vanilla px-4 py-3 text-night">
            <p className="font-mono text-[11px] uppercase tracking-wider text-night/60">
              This week&rsquo;s action
            </p>
            <p className="mt-1 text-base font-semibold leading-snug">{action}</p>
          </div>
        )}

        {/* Calendar block landing. Worded as a proposal: this is a demo,
            nothing is written to the user's calendar here. */}
        {phaseAtLeast(phase, "calendar-block") && slot && (
          <div className="block-drop flex max-w-[85%] items-stretch gap-3 self-start overflow-hidden rounded-2xl bg-pistachio text-night">
            <span className="w-1.5 shrink-0 bg-night/25" aria-hidden />
            <div className="py-3 pr-4">
              <p className="text-base font-semibold leading-snug">{slot.label}</p>
              <p className="text-sm text-night/70">
                Proposed for your calendar
              </p>
            </div>
          </div>
        )}

        {/* Counter */}
        {phaseAtLeast(phase, "counter") && (
          <p className="animate-[pop-in_0.35s_ease-out] self-start font-mono text-xs text-white/60">
            +{BLOCK_MINUTES} min planned. Zero minutes staring at a blank
            calendar.
          </p>
        )}
      </div>
    </div>
  );
}

const PHASE_ORDER: DemoPhase[] = [
  "typing",
  "goal-shown",
  "ai-thinking-1",
  "ai-reframe",
  "consensus",
  "ai-thinking-2",
  "action-item",
  "calendar-block",
  "counter",
  "ready",
];

function phaseAtLeast(current: DemoPhase, target: DemoPhase): boolean {
  return PHASE_ORDER.indexOf(current) >= PHASE_ORDER.indexOf(target);
}

// ---------------------------------------------------------------------------
// Hype screen — picks up exactly where the demo left off. The stat here is
// real (how long that just took), not a fabricated marketing number.

function HypeScreen({
  result,
  onContinue,
  finishing,
}: {
  result: DemoResult;
  onContinue: () => void;
  finishing: boolean;
}) {
  return (
    <div className="flex flex-1 flex-col justify-center gap-10 py-6">
      <div className="flex flex-col gap-6">
        <p className="animate-[fade-in-up_0.4s_ease-out] font-mono text-sm text-white/50">
          Start to scheduled
        </p>
        {/* The stat is real: how long the demo above actually took. */}
        <p
          className="display animate-[pop-in_0.5s_ease-out] text-[clamp(6rem,24vw,14rem)] leading-[0.8] text-strawberry"
          aria-label={`${result.elapsedSeconds} seconds`}
        >
          {result.elapsedSeconds}
          <MeltWord text="s" drips={{ 0: { x: 0.18, len: 0.3 } }} className="text-[0.62em]" />
        </p>
        <h1 className="display max-w-3xl animate-[fade-in-up_0.5s_ease-out] text-5xl text-white sm:text-7xl">
          That&rsquo;s the whole loop.
        </h1>
        <p className="max-w-xl animate-[fade-in-up_0.6s_ease-out] text-lg leading-8 text-white/70">
          You went from &ldquo;{result.goalText}&rdquo; to a concrete action
          with a time attached. Your first session does that for every role
          you play, against your real calendar, and nothing is added until
          you say yes.
        </p>
      </div>

      <ContinueButton tone="strawberry" disabled={finishing} onClick={onContinue}>
        {finishing ? "Starting…" : "Start my first planning session"}
      </ContinueButton>
    </div>
  );
}
