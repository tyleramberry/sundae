"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

// New onboarding (Day 7 redesign): survey -> live demo -> hype -> subscribe
// (Stripe Checkout) before the first weekly session. Replaces the old chat-transcript
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
        body: JSON.stringify({ completed: true }),
      });
    } catch (err) {
      console.error("Failed to mark onboarding complete:", err);
    }
    router.push("/subscribe");
  }

  function goNext() {
    setScreenIndex((i) => Math.min(i + 1, SCREEN_ORDER.length - 1));
  }

  return (
    <div className="flex flex-1 flex-col items-center bg-zinc-50 px-6 py-16 font-sans dark:bg-black">
      <div className="flex w-full max-w-lg flex-1 flex-col gap-8">
        <div className="flex flex-col gap-3">
          <span className="text-sm font-medium uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
            Sundae
          </span>
          <ProgressDots current={screenIndex} total={SCREEN_ORDER.length} />
        </div>

        {screen === "heard-from" && (
          <>
            <p className="-mt-4 text-xs text-zinc-500 dark:text-zinc-400">
              Your card won&apos;t be charged until 7 days after you start your trial.
            </p>
            <SingleSelectScreen
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
    </div>
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

function ProgressDots({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex gap-1.5">
      {Array.from({ length: total }).map((_, i) => (
        <span
          key={i}
          className={`h-1.5 flex-1 rounded-full transition-colors ${
            i <= current ? "bg-black dark:bg-white" : "bg-zinc-200 dark:bg-zinc-800"
          }`}
        />
      ))}
    </div>
  );
}

function Chip({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-4 py-2 text-left text-sm transition ${
        selected
          ? "border-black bg-black text-white dark:border-white dark:bg-white dark:text-black"
          : "border-zinc-300 text-zinc-700 hover:border-zinc-400 dark:border-zinc-700 dark:text-zinc-300 dark:hover:border-zinc-600"
      }`}
    >
      {label}
    </button>
  );
}

function ContinueButton({
  disabled,
  onClick,
  children = "Continue",
}: {
  disabled: boolean;
  onClick: () => void;
  children?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="self-start rounded-full bg-black px-5 py-2.5 text-sm font-medium text-white transition disabled:opacity-40 dark:bg-white dark:text-black"
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Survey screens

function SingleSelectScreen({
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
  value: string | null;
  onChange: (v: string) => void;
  onContinue: () => void;
}) {
  return (
    <div className="flex flex-1 flex-col gap-6 animate-[fade-in-up_0.35s_ease-out]">
      <div>
        <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">{title}</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{subtitle}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => (
          <Chip key={opt} label={opt} selected={value === opt} onClick={() => onChange(opt)} />
        ))}
      </div>
      <ContinueButton disabled={!value} onClick={onContinue} />
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
    <div className="flex flex-1 flex-col gap-6 animate-[fade-in-up_0.35s_ease-out]">
      <div>
        <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">{title}</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{subtitle}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => (
          <Chip key={opt} label={opt} selected={value.includes(opt)} onClick={() => toggle(opt)} />
        ))}
      </div>
      <ContinueButton disabled={value.length === 0} onClick={onContinue} />
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
    <div className="flex max-w-[80%] items-center gap-1 self-start rounded-2xl rounded-bl-sm bg-zinc-200 px-4 py-3 dark:bg-zinc-800">
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-500 [animation-delay:-0.3s] dark:bg-zinc-400" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-500 [animation-delay:-0.15s] dark:bg-zinc-400" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-500 dark:bg-zinc-400" />
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
      <div className="flex flex-1 flex-col gap-6 animate-[fade-in-up_0.35s_ease-out]">
        <div>
          <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">
            Now let&apos;s see it work.
          </h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Type one real thing that&apos;s actually on your mind this week — big or small.
          </p>
        </div>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <input
            autoFocus
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="e.g. get back in shape, close the seed round, spend more time with my kids…"
            className="rounded-2xl border border-zinc-300 px-4 py-3 text-sm text-black dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          />
          <ContinueButton disabled={!input.trim()} onClick={() => submit()}>
            Watch it happen
          </ContinueButton>
        </form>
      </div>
    );
  }

  const action = goalText ? deriveActionItem(goalText) : "";

  return (
    <div className="flex flex-1 flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">Watch it happen</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Same drill-down Sundae runs on every goal — vague idea to scheduled action.
        </p>
      </div>

      <div className="flex flex-1 flex-col justify-end gap-2 rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        {/* User's goal */}
        {phaseAtLeast(phase, "goal-shown") && (
          <div className="flex flex-col items-end gap-1">
            <div className="max-w-[80%] animate-[fade-in-up_0.3s_ease-out] self-end rounded-2xl rounded-br-sm bg-black px-4 py-2 text-sm text-white dark:bg-white dark:text-black">
              {goalText}
            </div>
            {phaseAtLeast(phase, "consensus") && (
              <span className="animate-[pop-in_0.3s_ease-out] rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400">
                That&apos;s the one ✓
              </span>
            )}
          </div>
        )}

        {phase === "ai-thinking-1" && <TypingDots />}

        {/* AI reframe */}
        {phaseAtLeast(phase, "ai-reframe") && (
          <div className="max-w-[80%] animate-[fade-in-up_0.3s_ease-out] self-start rounded-2xl rounded-bl-sm bg-zinc-200 px-4 py-2 text-sm text-black dark:bg-zinc-800 dark:text-zinc-100">
            If you could only get one thing done this week toward that, what would it be?
          </div>
        )}

        {phase === "ai-thinking-2" && <TypingDots />}

        {/* Concrete action item */}
        {phaseAtLeast(phase, "action-item") && (
          <div className="animate-[pop-in_0.35s_ease-out] self-start rounded-2xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm dark:border-emerald-900 dark:bg-emerald-950">
            <p className="text-xs font-medium uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
              This week&apos;s action
            </p>
            <p className="mt-1 text-black dark:text-zinc-50">{action}</p>
          </div>
        )}

        {/* Calendar block landing */}
        {phaseAtLeast(phase, "calendar-block") && slot && (
          <div className="animate-[pop-in_0.35s_ease-out] flex items-center gap-3 self-start rounded-2xl border border-zinc-200 bg-white px-4 py-3 shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-black text-white dark:bg-white dark:text-black">
              📅
            </span>
            <div>
              <p className="text-sm font-medium text-black dark:text-zinc-50">{slot.label}</p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">Added to your calendar</p>
            </div>
          </div>
        )}

        {/* Counter */}
        {phaseAtLeast(phase, "counter") && (
          <div className="animate-[pop-in_0.35s_ease-out] self-start text-sm font-medium text-emerald-700 dark:text-emerald-400">
            +{BLOCK_MINUTES} min planned, zero minutes spent staring at a blank calendar
          </div>
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
  const weeklyHoursIfEveryGoal = ((result.blockMinutes * 4) / 60).toFixed(1);

  return (
    <div className="flex flex-1 flex-col justify-center gap-6 animate-[fade-in-up_0.4s_ease-out]">
      <div className="flex flex-col gap-3">
        <span className="w-fit animate-[pop-in_0.4s_ease-out] rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400">
          {result.elapsedSeconds}s, start to scheduled
        </span>
        <h1 className="text-3xl font-semibold tracking-tight text-black dark:text-zinc-50">
          That&apos;s the whole loop.
        </h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          You just went from &ldquo;{result.goalText}&rdquo; to a scheduled action in{" "}
          {result.elapsedSeconds} seconds — no blank calendar, no deciding where to start.
        </p>
      </div>

      <div className="rounded-2xl border border-zinc-200 p-5 dark:border-zinc-800">
        <p className="text-sm text-zinc-700 dark:text-zinc-300">
          Do that for everything you&apos;re juggling — say 4 goals a week — and that&apos;s roughly{" "}
          <span className="font-semibold text-black dark:text-white">
            {weeklyHoursIfEveryGoal} hours
          </span>{" "}
          of &ldquo;figuring out what to do&rdquo; that Sundae just does for you, every single week.
        </p>
      </div>

      <ContinueButton disabled={finishing} onClick={onContinue}>
        Start your 7-day trial →
      </ContinueButton>
    </div>
  );
}
