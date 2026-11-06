"use client";

import { useState } from "react";

// Shared Stripe Checkout kick-off for /subscribe and the weekly-session
// free-limit card, so both handle the same 409s the same way: `in_flight`
// shows the message, `already_subscribed` offers the billing portal.
export function useStartCheckout({ from }: { from?: "limit" } = {}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [portalUrl, setPortalUrl] = useState<string | null>(null);

  async function startCheckout() {
    setLoading(true);
    setError(null);
    setPortalUrl(null);
    try {
      const url = from ? `/api/stripe/checkout?from=${from}` : "/api/stripe/checkout";
      const res = await fetch(url, { method: "POST" });
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

  return { loading, error, portalUrl, startCheckout };
}
