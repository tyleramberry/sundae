"use client";

import { useState } from "react";

export default function SubscribeCheckout({
  resubscribe,
  checkoutCanceled,
}: {
  resubscribe: boolean;
  checkoutCanceled: boolean;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function startCheckout() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/stripe/checkout", { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || typeof body.url !== "string") {
        setError(body.error ?? "Couldn't start checkout. Please try again.");
        setLoading(false);
        return;
      }
      window.location.assign(body.url);
    } catch {
      setError("Couldn't start checkout. Please try again.");
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex w-full max-w-md flex-col items-center justify-center gap-8 px-6 py-32 text-center sm:px-16">
        <span className="text-sm font-medium uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
          Sundae
        </span>
        <h1 className="text-3xl font-semibold tracking-tight text-black dark:text-zinc-50">
          {resubscribe ? "Pick up your subscription" : "Start your 7-day free trial"}
        </h1>
        <p className="text-base leading-7 text-zinc-600 dark:text-zinc-400">
          {resubscribe
            ? "Your trial or billing period has ended. Resubscribe to keep planning weeks on your calendar — same $12/month, cancel anytime from Settings."
            : "Card on file, no charge for 7 days. The first charge is $12/month unless you cancel from Settings before then."}
        </p>
        {checkoutCanceled && (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Checkout was canceled. You can start again whenever you&apos;re ready — nothing was charged.
          </p>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="button"
          onClick={() => void startCheckout()}
          disabled={loading}
          className="inline-flex items-center justify-center rounded-full bg-black px-5 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:opacity-60 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
        >
          {loading ? "Redirecting…" : resubscribe ? "Resubscribe" : "Continue to checkout"}
        </button>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Cancel anytime from Settings — no hoops.
        </p>
      </main>
    </div>
  );
}
