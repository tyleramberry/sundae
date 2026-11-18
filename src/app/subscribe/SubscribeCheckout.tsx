"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { trackMetaSubscribeOnce } from "@/lib/meta/pixel";
import FreeLimitCard from "@/components/billing/FreeLimitCard";
import FocusShell from "@/components/FocusShell";
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
      <FocusShell>
        <div className="flex flex-1 flex-col justify-center py-10">
          <FreeLimitCard limit={freeLimit} />
        </div>
      </FocusShell>
    );
  }

  return (
    <FocusShell>
      <div className="flex flex-1 flex-col justify-center gap-10 py-10">
        <h1 className="display max-w-4xl text-6xl sm:text-8xl">
          {resubscribe ? (
            <>Pick up where you left off.</>
          ) : (
            <>Keep every week planned.</>
          )}
        </h1>

        <div className="grid max-w-3xl border-y border-ink/15 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center sm:gap-12">
          <p className="display py-6 text-7xl sm:text-8xl">
            $7.99
            <span className="font-sans text-xl font-normal tracking-normal text-ink-secondary">
              {" "}
              / month
            </span>
          </p>
          <ul className="flex flex-col gap-2 border-t border-ink/15 py-6 text-lg text-ink sm:border-l sm:border-t-0 sm:pl-12">
            <li>Unlimited weekly planning sessions</li>
            <li>Your roles and history carry over</li>
            <li>Cancel anytime from Settings</li>
          </ul>
        </div>

        {resubscribe && (
          <p className="max-w-xl text-lg leading-8 text-ink-secondary">
            Your billing period has ended. Same price as before.
          </p>
        )}
        {checkoutCanceled && (
          <p className="max-w-xl border-l-2 border-strawberry pl-4 text-base text-ink-secondary">
            Checkout was canceled. Nothing was charged. Start again whenever
            you&rsquo;re ready.
          </p>
        )}
        {error && <p className="border-l-2 border-red-600 pl-4 text-sm text-red-600">{error}</p>}

        <div className="flex flex-wrap items-center gap-x-6 gap-y-4">
          <button
            type="button"
            onClick={() => void startCheckout()}
            disabled={loading}
            className="inline-flex items-center justify-center rounded-full bg-ink px-7 py-3.5 text-base font-semibold text-white transition hover:-translate-y-0.5 hover:bg-ink/85 active:translate-y-0 disabled:opacity-60"
          >
            {loading ? "Redirecting…" : resubscribe ? "Resubscribe" : "Continue to checkout"}
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
            Back to dashboard
          </Link>
        </div>
      </div>
    </FocusShell>
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
    <FocusShell tone="night">
      <div className="flex flex-1 flex-col justify-center gap-8 py-10">
        <p className="font-mono text-sm text-white/50">Payment received</p>
        <h1 className="display max-w-4xl text-6xl text-white sm:text-8xl">
          Scooping up your account
          <span className="caret ml-1 inline-block text-strawberry">.</span>
        </h1>
        <p className="max-w-xl text-lg leading-8 text-white/70">
          We&rsquo;re activating your subscription. This usually takes a few
          seconds, and you&rsquo;ll land right back in your planning session.
        </p>
      </div>
    </FocusShell>
  );
}
