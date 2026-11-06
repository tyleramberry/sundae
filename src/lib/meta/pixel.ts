"use client";

const SUBSCRIBE_KEY = "sundae_meta_subscribe";
const LEAD_KEY = "sundae_meta_lead";

function whenFbqReady(cb: () => void, attempts = 25): void {
  if (typeof window === "undefined") return;
  if (typeof window.fbq === "function") {
    cb();
    return;
  }
  if (attempts <= 0) return;
  window.setTimeout(() => whenFbqReady(cb, attempts - 1), 100);
}

function fbqTrack(event: string, params?: Record<string, unknown>): void {
  whenFbqReady(() => {
    try {
      window.fbq?.("track", event, params);
    } catch (err) {
      console.error(`[meta] fbq ${event} failed:`, err);
    }
  });
}

export function trackMetaLeadOnce(): void {
  if (typeof window === "undefined") return;
  try {
    if (sessionStorage.getItem(LEAD_KEY) === "1") return;
    sessionStorage.setItem(LEAD_KEY, "1");
  } catch {
    // Private mode can throw; still try to fire once this page load.
  }
  fbqTrack("Lead");
}

// Freemium: checkout charges immediately (no trial), so a completed
// checkout is Meta's standard Subscribe, not StartTrial. Server-side CAPI
// Subscribe uses the subscription id as event_id for dedupe.
export function trackMetaSubscribeOnce(): void {
  if (typeof window === "undefined") return;
  try {
    if (sessionStorage.getItem(SUBSCRIBE_KEY) === "1") return;
    sessionStorage.setItem(SUBSCRIBE_KEY, "1");
  } catch {
    // Continue — worst case we fire twice in the same session.
  }
  fbqTrack("Subscribe", { value: 7.99, currency: "USD" });
}
