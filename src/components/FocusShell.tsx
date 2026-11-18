// The frame for single-purpose screens outside the signed-in app shell:
// sign-in, onboarding, subscribe. Same visual language as the landing page
// (melting wordmark, canvas or night surface, nothing else competing), so
// going from the ad to the product never feels like switching apps.
//
// `tone="night"` flips the whole screen dark -- used for moments, not
// forms (the end of onboarding, payment confirmation).
import Link from "next/link";

export default function FocusShell({
  children,
  aside,
  tone = "canvas",
}: {
  children: React.ReactNode;
  /** Small element on the right of the top bar (step count, a link). */
  aside?: React.ReactNode;
  tone?: "canvas" | "night";
}) {
  const night = tone === "night";
  return (
    <div
      className={`flex flex-1 flex-col font-sans transition-colors duration-500 ${
        night ? "bg-night text-white" : "bg-canvas text-ink"
      }`}
    >
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-5 py-5 sm:px-10">
        <Link
          href="/"
          className={`melt melt-hover text-xl leading-none sm:text-2xl ${
            night ? "text-white" : "text-ink"
          }`}
        >
          Sundae
        </Link>
        {aside}
      </header>
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-5 pb-16 sm:px-10">
        {children}
      </main>
    </div>
  );
}
