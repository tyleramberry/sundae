"use client";

import { useEffect, useState } from "react";
import GoogleSignInButton from "@/components/GoogleSignInButton";

// Phone-only call to action pinned to the bottom of the landing page.
//
// Most ad traffic lands on a phone, and on a phone the hero button scrolls
// away within one thumb-flick. This keeps the same sign-in one tap away
// for the rest of the page -- but only while neither of the page's own
// CTAs (marked with `data-cta`) is on screen, so there are never two
// identical buttons stacked on top of each other.
export default function StickyCta({ note }: { note: string }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const targets = Array.from(document.querySelectorAll("[data-cta]"));
    if (targets.length === 0) return;

    const onScreen = new Set<Element>();
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) onScreen.add(entry.target);
        else onScreen.delete(entry.target);
      }
      // `scrollY > 200` keeps the bar from flashing in before the hero's
      // own button has had a chance to be seen at all.
      setShow(onScreen.size === 0 && window.scrollY > 200);
    });

    targets.forEach((t) => observer.observe(t));
    return () => observer.disconnect();
  }, []);

  return (
    <div
      // `inert` rather than aria-hidden: it also takes the off-screen
      // button out of the tab order, which aria-hidden alone doesn't.
      inert={!show}
      className={`fixed inset-x-0 bottom-0 z-30 border-t border-ink/10 bg-canvas/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur transition-transform duration-300 md:hidden ${
        show ? "translate-y-0" : "pointer-events-none translate-y-full"
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs leading-4 text-ink-secondary">{note}</span>
        <GoogleSignInButton
          label="Start free"
          className="inline-flex shrink-0 items-center gap-2 rounded-full bg-ink py-1.5 pl-1.5 pr-4 text-sm font-semibold text-white transition hover:bg-ink/85 disabled:opacity-60"
        />
      </div>
    </div>
  );
}
