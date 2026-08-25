"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const POLL_MS = 2500;
const TIMEOUT_MS = 90_000;

export default function SubscribeCheckout({
  resubscribe,
  checkoutCanceled,
  checkoutSuccess,
}: {
  resubscribe: boolean;
  checkoutCanceled: boolean;
  checkoutSuccess: boolean;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [portalUrl, setPortalUrl] = useState<string | null>(null);

  if (checkoutSuccess) {
    return <CheckoutConfirming />;
  }

  async function startCheckout() {
    setLoading(true);
    setError(null);
    setPortalUrl(null);
    try {
      const res = await fetch("/api/stripe/checkout", { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (res.status === 409) {
        setError(body.error ?? "There's already a subscription on this account.");
        if (typeof body.portalUrl === "string") setPortalUrl(body.portalUrl);
        setLoading(false);
        return;
      }
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
        {portalUrl ? (
          <button
            type="button"
            onClick={() => window.location.assign(portalUrl)}
            className="inline-flex items-center justify-center rounded-full bg-black px-5 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
          >
            Manage subscription
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void startCheckout()}
            disabled={loading}
            className="inline-flex items-center justify-center rounded-full bg-black px-5 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:opacity-60 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
          >
            {loading ? "Redirecting…" : resubscribe ? "Resubscribe" : "Continue to checkout"}
          </button>
        )}
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Cancel anytime from Settings — no hoops.
        </p>
      </main>
    </div>
  );
}

function CheckoutConfirming() {
  const router = useRouter();
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const started = Date.now();

    async function tick() {
      if (cancelled) return;
      if (Date.now() - started >= TIMEOUT_MS) {
        setTimedOut(true);
        return;
      }
      try {
        const res = await fetch("/api/stripe/status");
        const body = await res.json().catch(() => ({}));
        if (res.ok && body.entitled === true) {
          router.replace("/dashboard");
          return;
        }
      } catch {
        // Keep polling — a blip shouldn't dump the user back to Checkout.
      }
      window.setTimeout(() => void tick(), POLL_MS);
    }

    void tick();
    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex w-full max-w-md flex-col items-center justify-center gap-6 px-6 py-32 text-center sm:px-16">
        <span className="text-sm font-medium uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
          Sundae
        </span>
        <h1 className="text-3xl font-semibold tracking-tight text-black dark:text-zinc-50">
          Confirming your trial
        </h1>
        {timedOut ? (
          <>
            <p className="text-base leading-7 text-zinc-600 dark:text-zinc-400">
              Billing is taking a little longer than usual. Refresh this page in a moment. If it
              still hasn&apos;t gone through, contact us — you won&apos;t be charged twice.
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex items-center justify-center rounded-full bg-black px-5 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
            >
              Refresh
            </button>
          </>
        ) : (
          <p className="text-base leading-7 text-zinc-600 dark:text-zinc-400">
            Card received. We&apos;re confirming your 7-day trial — this usually takes a few seconds.
          </p>
        )}
      </main>
    </div>
  );
}
