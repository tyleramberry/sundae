"use client";

import { useEffect, useRef, useState } from "react";

// Scroll-reveal wrapper for the landing page. One IntersectionObserver per
// element, disconnected the moment it fires -- reveals are one-shot, so
// there's nothing to keep observing, and nothing re-hides when you scroll
// back up (content that flickers away on an upward scroll reads as a bug).
//
// The displaced starting state lives in globals.css under `.reveal`, not
// here, so the reduced-motion guard at the bottom of that file can switch
// the whole motion layer off in one place.
export default function Reveal({
  children,
  delay = 0,
  scale = false,
  className = "",
}: {
  children: React.ReactNode;
  /** Stagger offset in ms, applied via CSS transition-delay. */
  delay?: number;
  /** Add a slight scale-up to the entrance -- for cards, not text. */
  scale?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Already on screen at mount (above the fold, or a reload partway down
    // the page): reveal without waiting for an intersection change, which
    // for an element that starts fully visible may never come.
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          setVisible(true);
          observer.disconnect();
        }
      },
      // Fires a little before the element's top edge clears the bottom of
      // the viewport, so the transition is already underway by the time
      // it's properly in view rather than starting late.
      { threshold: 0.05, rootMargin: "0px 0px -40px 0px" },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      style={{ "--reveal-delay": `${delay}ms` } as React.CSSProperties}
      className={`reveal ${scale ? "reveal-scale" : ""} ${
        visible ? "is-visible" : ""
      } ${className}`}
    >
      {children}
    </div>
  );
}
