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

  return (
    <div className="flex w-full max-w-md flex-col items-center gap-6 text-center">
      <span className="text-sm font-medium uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
        Sundae
      </span>
      <h1 className="text-3xl font-semibold tracking-tight text-black dark:text-zinc-50">
        You&apos;ve used your {limit} free planning sessions
      </h1>
      <p className="text-base leading-7 text-zinc-600 dark:text-zinc-400">
        Sundae has planned two weeks with you. To plan week three — and every week after —
        subscribe for $7.99/month. Your roles, goals, and history stay exactly as they are.
      </p>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex flex-col items-center gap-3">
        <button
          type="button"
          onClick={() => void startCheckout()}
          disabled={loading}
          className="inline-flex items-center justify-center rounded-full bg-black px-5 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:opacity-60 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
        >
          {loading ? "Redirecting…" : "Subscribe to keep planning"}
        </button>
        {portalUrl && (
          <button
            type="button"
            onClick={() => window.location.assign(portalUrl)}
            className="inline-flex items-center justify-center rounded-full border border-zinc-300 bg-white px-5 py-2.5 text-sm font-medium text-zinc-800 transition hover:border-zinc-400 dark:border-zinc-700 dark:bg-black dark:text-zinc-200"
          >
            Manage subscription
          </button>
        )}
        <Link
          href="/dashboard"
          className="inline-flex items-center justify-center rounded-full border border-zinc-300 bg-white px-5 py-2.5 text-sm font-medium text-zinc-800 transition hover:border-zinc-400 dark:border-zinc-700 dark:bg-black dark:text-zinc-200"
        >
          Not now
        </Link>
      </div>
      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        Cancel anytime from Settings. Your dashboard and past plans stay free to view.
      </p>
    </div>
  );
}
