"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Persistence key -- localStorage is the primary gate so the tutorial
// doesn't replay on every page load. A Supabase-backed column can be
// added later as a cross-browser fallback, but for launch localStorage
// is sufficient and avoids a migration + API round-trip on every app
// mount.
const STORAGE_KEY = "sundae:tutorial:dismissed";

// Force-show key -- set by the "Replay tutorial" sidebar control or
// by appending ?tutorial=1 to any (app) route. Cleared automatically
// once the tour starts so it doesn't re-fire on the next navigation.
const FORCE_KEY = "sundae:tutorial:force";

export type TutorialStep = {
  /** CSS selector for the element to spotlight. */
  target: string;
  /** Route this step lives on -- the overlay navigates here before
   *  searching for the target. */
  route: string;
  /** Bold headline in the tooltip. */
  headline: string;
  /** 1-2 sentence explanation. */
  body: string;
  /** Where to position the tooltip relative to the spotlight. */
  placement: "top" | "bottom" | "left" | "right";
};

export type UseTutorialReturn = {
  /** Whether the overlay should render at all. */
  active: boolean;
  /** Current step index (0-based). */
  stepIndex: number;
  /** The current step definition, or null when inactive. */
  step: TutorialStep | null;
  /** Total number of steps. */
  totalSteps: number;
  /** Advance to the next step, or finish if on the last one. */
  next: () => void;
  /** Jump back one step. */
  back: () => void;
  /** Dismiss the tutorial permanently. */
  skip: () => void;
  /** Force-start the tutorial from step 0. */
  restart: () => void;
};

export const TUTORIAL_STEPS: TutorialStep[] = [
  {
    target: "[data-tour='session-header']",
    route: "/weekly-session",
    headline: "This is your weekly planning session",
    body: "Every week starts here. Sundae walks through each of your roles and helps you set habits, goals, and projects — then drills them down into real action items. Just talk naturally.",
    placement: "bottom",
  },
  {
    target: "[data-tour='panel-toggle']",
    route: "/weekly-session",
    headline: "Plan & Calendar views",
    body: "As you talk, your plan builds live on the right. Toggle to Calendar to see how it maps onto your real Google Calendar — blocks fill in as you go.",
    placement: "bottom",
  },
  {
    target: "[data-tour='compose-bar']",
    route: "/weekly-session",
    headline: "Review before it lands",
    body: "When your session is done, Sundae shows you the proposed calendar. Chat to revise anything, then confirm. Nothing writes to your calendar without your say-so.",
    placement: "top",
  },
  {
    target: "[data-tour='master-score']",
    route: "/dashboard",
    headline: "Your weekly score",
    body: "This is your at-a-glance number — the average of all your role KPIs. It shows how much of what you planned actually got done. The sparkline tracks your trend over time.",
    placement: "bottom",
  },
  {
    target: "[data-tour='role-rings']",
    route: "/dashboard",
    headline: "KPIs by role",
    body: "Each ring is one role you wear. The fill shows how much of that role's plan is complete. Click any ring for its 6-week trend, or hover a role name to see what's under it.",
    placement: "top",
  },
  {
    target: "[data-tour='new-session-btn']",
    route: "/dashboard",
    headline: "Start anytime",
    body: "Your plan is set once a week, but you can come back anytime to add something that came up. Sundae picks up right where you left off.",
    placement: "bottom",
  },
  {
    target: "[data-tour='follow-up-list']",
    route: "/daily-follow-ups",
    headline: "Check off what you did",
    body: "This is the only place your scores move. Check off habits and goals as you complete them, drag the slider on projects. Every change updates your dashboard instantly.",
    placement: "top",
  },
  {
    target: "[data-tour='sidebar-nav']",
    route: "/daily-follow-ups",
    headline: "That's the whole loop",
    body: "Plan your week → do the work → check it off → watch your scores climb. Three pages, one loop. You're ready.",
    placement: "right",
  },
];

export function useTutorial(): UseTutorialReturn {
  const [active, setActive] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const didInit = useRef(false);

  // Check on mount whether to show the tutorial. setState calls are
  // scheduled on a microtask to satisfy the react-hooks/set-state-in-
  // effect lint rule (same pattern the split-width reader in weekly-
  // session uses).
  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;

    queueMicrotask(() => {
      try {
        const dismissed = localStorage.getItem(STORAGE_KEY);
        const forced = localStorage.getItem(FORCE_KEY);

        if (forced === "1") {
          localStorage.removeItem(FORCE_KEY);
          setStepIndex(0);
          setActive(true);
        } else if (!dismissed) {
          setStepIndex(0);
          setActive(true);
        }
      } catch {
        // localStorage blocked (private browsing, etc.) -- default to not
        // showing so the app stays usable.
      }
    });
  }, []);

  const dismiss = useCallback(() => {
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // Best-effort.
    }
    setActive(false);
    setStepIndex(0);
  }, []);

  const next = useCallback(() => {
    setStepIndex((i) => {
      if (i >= TUTORIAL_STEPS.length - 1) {
        dismiss();
        return 0;
      }
      return i + 1;
    });
  }, [dismiss]);

  const back = useCallback(() => {
    setStepIndex((i) => Math.max(0, i - 1));
  }, []);

  const restart = useCallback(() => {
    try {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.setItem(FORCE_KEY, "1");
    } catch {
      // Best-effort.
    }
    setStepIndex(0);
    setActive(true);
  }, []);

  return {
    active,
    stepIndex,
    step: active ? TUTORIAL_STEPS[stepIndex] ?? null : null,
    totalSteps: TUTORIAL_STEPS.length,
    next,
    back,
    skip: dismiss,
    restart,
  };
}
