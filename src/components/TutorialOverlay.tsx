"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useTutorial } from "@/lib/hooks/useTutorial";
import { useReducedMotion } from "@/lib/hooks/useReducedMotion";

// ---------------------------------------------------------------------------
// Spotlight geometry: a single absolutely-positioned div uses a massive
// box-shadow to darken everything *outside* its bounds, creating the
// "cutout" effect without SVG masks or clip-paths. Cheaper to animate
// than a clip-path (just reposition + resize the div) and works in every
// browser without fallback. The div itself is transparent; the shadow is
// the overlay.
// ---------------------------------------------------------------------------

type Rect = { top: number; left: number; width: number; height: number };

const SPOT_PAD = 8; // px of breathing room around the target
const SPOT_RADIUS = 12; // border-radius of the spotlight cutout
const TOOLTIP_GAP = 12; // px between spotlight edge and tooltip
const TOOLTIP_MAX_W = 320; // max tooltip width

function getTargetRect(selector: string): Rect | null {
  const el = document.querySelector(selector);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return {
    top: r.top - SPOT_PAD,
    left: r.left - SPOT_PAD,
    width: r.width + SPOT_PAD * 2,
    height: r.height + SPOT_PAD * 2,
  };
}

// Position the tooltip so it doesn't overflow the viewport. Falls back
// to "bottom" when the preferred placement clips.
function computeTooltipStyle(
  spot: Rect,
  placement: "top" | "bottom" | "left" | "right",
  tooltipW: number,
  tooltipH: number,
): React.CSSProperties {
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  let top = 0;
  let left = 0;

  if (placement === "bottom") {
    top = spot.top + spot.height + TOOLTIP_GAP;
    left = spot.left + spot.width / 2 - tooltipW / 2;
  } else if (placement === "top") {
    top = spot.top - tooltipH - TOOLTIP_GAP;
    left = spot.left + spot.width / 2 - tooltipW / 2;
  } else if (placement === "right") {
    top = spot.top + spot.height / 2 - tooltipH / 2;
    left = spot.left + spot.width + TOOLTIP_GAP;
  } else {
    // left
    top = spot.top + spot.height / 2 - tooltipH / 2;
    left = spot.left - tooltipW - TOOLTIP_GAP;
  }

  // Clamp to viewport.
  if (left < 12) left = 12;
  if (left + tooltipW > vw - 12) left = vw - 12 - tooltipW;
  if (top < 12) top = 12;
  if (top + tooltipH > vh - 12) top = vh - 12 - tooltipH;

  return { position: "fixed", top, left, width: tooltipW };
}

// Arrow pointing from the tooltip toward the spotlight.
function arrowPlacement(
  placement: "top" | "bottom" | "left" | "right",
): React.CSSProperties {
  const base: React.CSSProperties = {
    position: "absolute",
    width: 12,
    height: 12,
    background: "inherit",
    transform: "rotate(45deg)",
    borderRadius: 2,
  };
  if (placement === "bottom") return { ...base, top: -5, left: "calc(50% - 6px)" };
  if (placement === "top") return { ...base, bottom: -5, left: "calc(50% - 6px)" };
  if (placement === "right") return { ...base, left: -5, top: "calc(50% - 6px)" };
  return { ...base, right: -5, top: "calc(50% - 6px)" };
}

export default function TutorialOverlay() {
  const { active, stepIndex, step, totalSteps, next, back, skip } =
    useTutorial();
  const reducedMotion = useReducedMotion(false);
  const router = useRouter();
  const pathname = usePathname();

  const [spot, setSpot] = useState<Rect | null>(null);
  const [tooltipSize, setTooltipSize] = useState({ w: TOOLTIP_MAX_W, h: 180 });
  const [transitioning, setTransitioning] = useState(false);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const spotlightRef = useRef<HTMLDivElement>(null);
  // Track whether we're waiting for a navigation to land.
  const pendingRoute = useRef<string | null>(null);

  // Measure the tooltip after it renders so positioning is accurate.
  useEffect(() => {
    if (!tooltipRef.current) return;
    const r = tooltipRef.current.getBoundingClientRect();
    setTooltipSize({ w: r.width, h: r.height });
  }, [stepIndex, active]);

  // Navigate to the step's route if we're not already there.
  const ensureRoute = useCallback(
    (route: string) => {
      if (pathname === route || pathname.startsWith(route + "/")) {
        return true; // already there
      }
      pendingRoute.current = route;
      router.push(route);
      return false;
    },
    [pathname, router],
  );

  // When the pathname changes to match a pending navigation, search for
  // the target element.
  useEffect(() => {
    if (!active || !step) return;

    const isOnRoute =
      pathname === step.route || pathname.startsWith(step.route + "/");
    if (!isOnRoute) return;

    pendingRoute.current = null;

    // The page may still be hydrating -- poll briefly for the target.
    // If it's not found after 2s, show the tooltip centered without a
    // spotlight (the element might be conditionally rendered, e.g. the
    // panel toggle only appears during "chatting" stage).
    let attempts = 0;
    const maxAttempts = 20; // 2 seconds max
    const poll = setInterval(() => {
      const rect = getTargetRect(step.target);
      if (rect) {
        clearInterval(poll);
        setSpot(rect);
        setTransitioning(false);
      } else if (attempts >= maxAttempts) {
        clearInterval(poll);
        // No spotlight, but still show the tooltip so the tour
        // isn't stuck.
        setSpot(null);
        setTransitioning(false);
      }
      attempts++;
    }, 100);

    return () => clearInterval(poll);
  }, [active, step, pathname, stepIndex]);

  // Kick off navigation when step changes and we're on the wrong route.
  // setState is on a microtask to satisfy react-hooks/set-state-in-effect.
  useEffect(() => {
    if (!active || !step) return;
    const isOnRoute =
      pathname === step.route || pathname.startsWith(step.route + "/");
    if (!isOnRoute) {
      queueMicrotask(() => {
        setTransitioning(true);
        setSpot(null);
      });
      ensureRoute(step.route);
    }
  }, [active, step, pathname, ensureRoute, stepIndex]);

  // Re-measure on resize/scroll so the spotlight tracks correctly.
  useEffect(() => {
    if (!active || !step) return;
    const reposition = () => {
      const rect = getTargetRect(step.target);
      if (rect) setSpot(rect);
    };
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [active, step]);

  if (!active || !step) return null;

  const transitionProp = reducedMotion ? "none" : "all 0.35s cubic-bezier(0.4, 0, 0.2, 1)";

  const tooltipStyle = spot
    ? computeTooltipStyle(spot, step.placement, tooltipSize.w, tooltipSize.h)
    : { position: "fixed" as const, top: "50%", left: "50%", transform: "translate(-50%, -50%)", width: TOOLTIP_MAX_W };

  return (
    <>
      {/* Full-viewport click-catcher -- clicking outside the tooltip
          does nothing (doesn't advance or dismiss), so the tour only
          moves forward deliberately. The spotlight div punches a
          visual hole but is pointer-events-none so the target element
          underneath can't be accidentally clicked during the tour. */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 9998,
        }}
        aria-hidden
      />

      {/* Spotlight cutout. The div itself is the "hole"; its enormous
          box-shadow is the darkened surround. */}
      {spot && (
        <div
          ref={spotlightRef}
          style={{
            position: "fixed",
            top: spot.top,
            left: spot.left,
            width: spot.width,
            height: spot.height,
            borderRadius: SPOT_RADIUS,
            boxShadow: "0 0 0 9999px rgba(28, 25, 23, 0.6)",
            zIndex: 9999,
            pointerEvents: "none",
            transition: transitionProp,
          }}
          aria-hidden
        />
      )}

      {/* No spotlight yet (still navigating) -- just the dark overlay. */}
      {!spot && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(28, 25, 23, 0.6)",
            zIndex: 9999,
            pointerEvents: "none",
          }}
          aria-hidden
        />
      )}

      {/* Progress bar. */}
      <div
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          height: 3,
          zIndex: 10001,
          background: "rgba(28, 25, 23, 0.12)",
        }}
        aria-hidden
      >
        <div
          style={{
            height: "100%",
            width: `${((stepIndex + 1) / totalSteps) * 100}%`,
            background: "#7A9E7E",
            transition: reducedMotion ? "none" : "width 0.4s ease",
            borderRadius: "0 2px 2px 0",
          }}
        />
      </div>

      {/* Tooltip card. */}
      <div
        ref={tooltipRef}
        role="dialog"
        aria-label={`Tutorial step ${stepIndex + 1} of ${totalSteps}`}
        aria-modal="false"
        style={{
          ...tooltipStyle,
          zIndex: 10000,
          maxWidth: TOOLTIP_MAX_W,
          opacity: transitioning ? 0 : 1,
          transition: reducedMotion ? "none" : "opacity 0.25s ease",
        }}
      >
        {/* Arrow */}
        {spot && (
          <div
            style={{
              ...arrowPlacement(step.placement),
              background: "#FFFDF9",
              zIndex: -1,
            }}
            aria-hidden
          />
        )}

        <div
          style={{
            background: "#FFFDF9",
            borderRadius: 14,
            padding: "20px 22px 16px",
            boxShadow: "0 8px 32px rgba(28, 25, 23, 0.18), 0 2px 8px rgba(28, 25, 23, 0.08)",
            border: "1px solid rgba(28, 25, 23, 0.06)",
          }}
        >
          {/* Step counter */}
          <p
            style={{
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: "0.08em",
              textTransform: "uppercase" as const,
              color: "#7A9E7E",
              margin: "0 0 8px 0",
            }}
          >
            {stepIndex + 1} of {totalSteps}
          </p>

          {/* Headline */}
          <h2
            style={{
              fontSize: 16,
              fontWeight: 600,
              color: "#1C1917",
              lineHeight: 1.35,
              margin: "0 0 6px 0",
            }}
          >
            {step.headline}
          </h2>

          {/* Body */}
          <p
            style={{
              fontSize: 13.5,
              lineHeight: 1.55,
              color: "#57534E",
              margin: "0 0 16px 0",
            }}
          >
            {step.body}
          </p>

          {/* Controls */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8,
            }}
          >
            <button
              type="button"
              onClick={skip}
              style={{
                background: "none",
                border: "none",
                fontSize: 12,
                color: "#C4BAB1",
                cursor: "pointer",
                padding: "4px 0",
                fontWeight: 500,
              }}
            >
              Skip tour
            </button>
            <div style={{ display: "flex", gap: 6 }}>
              {stepIndex > 0 && (
                <button
                  type="button"
                  onClick={back}
                  style={{
                    background: "none",
                    border: "1px solid #DDD6CC",
                    borderRadius: 999,
                    padding: "6px 14px",
                    fontSize: 13,
                    fontWeight: 500,
                    color: "#44403C",
                    cursor: "pointer",
                  }}
                >
                  Back
                </button>
              )}
              <button
                type="button"
                onClick={next}
                style={{
                  background: "#1C1917",
                  border: "none",
                  borderRadius: 999,
                  padding: "6px 16px",
                  fontSize: 13,
                  fontWeight: 500,
                  color: "#FAF7F2",
                  cursor: "pointer",
                }}
              >
                {stepIndex === totalSteps - 1 ? "Done" : "Next →"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
