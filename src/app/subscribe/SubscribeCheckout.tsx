"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { trackMetaSubscribeOnce } from "@/lib/meta/pixel";
import FreeLimitCard from "@/components/billing/FreeLimitCard";
import { useStartCheckout } from "@/components/billing/useStartCheckout";

const POLL_MS = 2500;
const TIMEOUT_MS = 90_000;

export default function SubscribeCheckout({
  resubscribe,
  limitReached,
  freeLimit,
  checkoutCanceled,
  checkoutSuccess,
  checkoutSessionId,
}: {
  resubscribe: boolean;
  limitReached: boolean;
  freeLimit: number;
  checkoutCanceled: boolean;
  checkoutSuccess: boolean;
  checkoutSessionId: string | null;
}) {
  const { loading, error, portalUrl, startCheckout } = useStartCheckout();

  if (checkoutSuccess) {
    return <CheckoutConfirming sessionId={checkoutSessionId} />;
  }

  // Freemium: /subscribe is the upgrade page, not a gate. A free user who's
  // actually at the limit gets the same card the weekly-session page shows.
  if (limitReached && !checkoutCanceled) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center bg-zinc-50 px-6 py-32 font-sans dark:bg-black sm:px-16">
        <FreeLimitCard limit={freeLimit} />
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex w-full max-w-md flex-col items-center justify-center gap-8 px-6 py-32 text-center sm:px-16">
        <span className="text-sm font-medium uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
          Sundae
        </span>
        <h1 className="text-3xl font-semibold tracking-tight text-black dark:text-zinc-50">
          {resubscribe ? "Pick up your subscription" : "Keep planning with Sundae"}
        </h1>
        <p className="text-base leading-7 text-zinc-600 dark:text-zinc-400">
          {resubscribe
            ? "Your billing period has ended. Resubscribe to keep planning weeks on your calendar — same $7.99/month, cancel anytime from Settings."
            : "$7.99/month. Unlimited weekly planning sessions. Cancel anytime from Settings."}
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
          <Link
            href="/dashboard"
            className="text-sm text-zinc-500 underline-offset-4 hover:underline dark:text-zinc-400"
          >
            Back to dashboard
          </Link>
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
          trackMetaSubscribeOnce(
            typeof body.subscriptionId === "string" ? body.subscriptionId : null,
          );
          // Freemium: land back where the free limit blocked them.
          router.replace("/weekly-session");
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
          Confirming your subscription
        </h1>
        <p className="text-base leading-7 text-zinc-600 dark:text-zinc-400">
          Payment received. We&apos;re activating your account — this usually takes a few seconds.
        </p>
      </main>
    </div>
  );
}
