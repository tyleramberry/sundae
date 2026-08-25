"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { trackMetaStartTrialOnce } from "@/lib/meta/pixel";

const POLL_MS = 2500;
const TIMEOUT_MS = 90_000;

export default function SubscribeCheckout({
  resubscribe,
  checkoutCanceled,
  checkoutSuccess,
  checkoutSessionId,
}: {
  resubscribe: boolean;
  checkoutCanceled: boolean;
  checkoutSuccess: boolean;
  checkoutSessionId: string | null;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [portalUrl, setPortalUrl] = useState<string | null>(null);

  if (checkoutSuccess) {
    return <CheckoutConfirming sessionId={checkoutSessionId} />;
  }

  async function startCheckout() {
    setLoading(true);
    setError(null);
    setPortalUrl(null);
    try {
      const res = await fetch("/api/stripe/checkout", { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (res.status === 409) {
        setError(body.error ?? "Couldn't start checkout.");
        if (body.code === "already_subscribed" && typeof body.portalUrl === "string") {
          setPortalUrl(body.portalUrl);
        }
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
            ? "Your trial or billing period has ended. Resubscribe to keep planning weeks on your calendar — same $7.99/month, cancel anytime from Settings."
            : "Card on file, no charge for 7 days. The first charge is $7.99/month unless you cancel from Settings before then."}
        </p>
        {checkoutCanceled && (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Checkout was canceled. You can start again whenever you&apos;re ready — nothing was charged.
          </p>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex flex-col items-center gap-3">
          <button
            type="button"
            onClick={() => void startCheckout()}
            disabled={loading}
            className="inline-flex items-center justify-center rounded-full bg-black px-5 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:opacity-60 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
          >
            {loading ? "Redirecting…" : resubscribe ? "Resubscribe" : "Continue to checkout"}
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
        </div>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Cancel anytime from Settings — no hoops.
        </p>
      </main>
    </div>
  );
}

function CheckoutConfirming({ sessionId }: { sessionId: string | null }) {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    const started = Date.now();

    async function tick() {
      if (cancelled) return;
      if (Date.now() - started >= TIMEOUT_MS) {
        router.replace("/subscribe");
        return;
      }
      try {
        const url = sessionId
          ? `/api/stripe/status?session_id=${encodeURIComponent(sessionId)}`
          : "/api/stripe/status";
        const res = await fetch(url);
        const body = await res.json().catch(() => ({}));
        if (res.ok && body.entitled === true) {
          trackMetaStartTrialOnce();
          router.replace("/dashboard");
          return;
        }
        if (res.ok && body.pending === true) {
          window.setTimeout(() => void tick(), POLL_MS);
          return;
        }
        if (res.ok && body.status !== "incomplete") {
          router.replace("/subscribe");
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
  }, [router, sessionId]);

  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex w-full max-w-md flex-col items-center justify-center gap-6 px-6 py-32 text-center sm:px-16">
        <span className="text-sm font-medium uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
          Sundae
        </span>
        <h1 className="text-3xl font-semibold tracking-tight text-black dark:text-zinc-50">
          Confirming your trial
        </h1>
        <p className="text-base leading-7 text-zinc-600 dark:text-zinc-400">
          Card received. We&apos;re confirming your 7-day trial — this usually takes a few seconds.
        </p>
      </main>
    </div>
  );
}
