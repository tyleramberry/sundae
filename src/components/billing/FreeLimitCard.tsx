"use client";

import Link from "next/link";
import { useStartCheckout } from "./useStartCheckout";

// Freemium limit-reached card (PRD §D). Shown in place of the weekly-session
// chat when a free user has used their free sessions and tries to start a
// new week, and as the /subscribe page body when they land there at the
// limit. "Not now" is a real, visible way out -- the dashboard, daily
// follow-ups and past plans stay free.
export default function FreeLimitCard({ limit }: { limit: number }) {
  const { loading, error, portalUrl, startCheckout } = useStartCheckout({ from: "limit" });

  // Left-aligned and set in the landing page's display type. This renders
  // both on /subscribe (inside FocusShell) and in place of the chat inside
  // the signed-in weekly-session screen, so it carries no page chrome of
  // its own.
  return (
    <div className="flex w-full max-w-3xl flex-col gap-8">
      <p className="font-mono text-sm text-ink-secondary">
        {limit} of {limit} free sessions used
      </p>
      <h1 className="display text-5xl sm:text-7xl">
        Week {limit + 1} is waiting.
      </h1>
      <p className="max-w-xl text-lg leading-8 text-ink-secondary">
        Sundae has planned {limit} weeks with you. To keep going, subscribe for
        $7.99/month. Your roles, goals, and history stay exactly as they are.
      </p>
      {error && <p className="border-l-2 border-red-600 pl-4 text-sm text-red-600">{error}</p>}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-4">
        <button
          type="button"
          onClick={() => void startCheckout()}
          disabled={loading}
          className="inline-flex items-center justify-center rounded-full bg-ink px-7 py-3.5 text-base font-semibold text-white transition hover:-translate-y-0.5 hover:bg-black active:translate-y-0 disabled:opacity-60"
        >
          {loading ? "Redirecting…" : "Subscribe to keep planning"}
        </button>
        {portalUrl && (
          <button
            type="button"
            onClick={() => window.location.assign(portalUrl)}
            className="inline-flex items-center justify-center rounded-full border border-ink/15 px-6 py-3.5 text-base font-medium text-ink transition hover:border-ink/40"
          >
            Manage subscription
          </button>
        )}
        <Link
          href="/dashboard"
          className="text-base text-ink-secondary underline decoration-ink/20 underline-offset-4 hover:text-ink"
        >
          Not now
        </Link>
      </div>
      <p className="text-sm text-ink-secondary">
        Cancel anytime from Settings. Your dashboard and past plans stay free
        to view.
      </p>
    </div>
  );
}
