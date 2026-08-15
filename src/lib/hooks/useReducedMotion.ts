"use client";

import { useSyncExternalStore } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

function subscribe(onChange: () => void) {
  const media = window.matchMedia(QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

// Subscribed rather than read once in an effect, so flipping the OS setting
// with the page open takes effect immediately -- and so components never
// have to setState from an effect body to find out.
//
// `assumeReducedOnServer` picks what the server render (and the first
// client paint, before hydration can check the real value) guesses.
// useSyncExternalStore's contract is what makes changing this safe: React
// uses the server snapshot for hydration too, so as long as the initial
// markup here matches what `getServerSnapshot` returns, there's no
// hydration-mismatch warning -- only a possible one-time swap once the
// real client value comes in after mount, for whichever guess turns out
// wrong.
//
// Default `true` (assume reduced): right for a component whose two states
// are the same layout, just animated or not -- AgentDemo's "done" frame
// *is* its loop's natural resting point, so guessing reduced draws that
// resting frame first regardless of which way the real preference lands.
// A component that renders a structurally different layout for reduced
// motion (WeekAssembly's pinned scroll section vs. its plain stacked
// fallback) should instead pass `false`: reduced-motion users are a small
// minority, so optimizing the common case avoids a layout jump for nearly
// everyone, at the cost of one such jump for the minority who'll get it
// corrected right after mount.
export function useReducedMotion(assumeReducedOnServer = true): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => assumeReducedOnServer,
  );
}
