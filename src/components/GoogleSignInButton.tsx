"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getAppUrl } from "@/lib/appUrl";

const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar";

// Shared Google OAuth entry point -- used on both the landing page CTA and
// the /login page so there's one definition of the scope + offline-token
// dance. `next` is forwarded to /auth/callback so a deep link
// (e.g. /login?next=/daily-follow-ups) lands where it meant to after login.
export default function GoogleSignInButton({
  next,
  label = "Sign in with Google",
  className,
}: {
  next?: string;
  label?: string;
  className?: string;
}) {
  const [loading, setLoading] = useState(false);

  async function signInWithGoogle() {
    setLoading(true);
    const supabase = createClient();
    // Bug fix: this used to be `window.location.origin`, which follows
    // whatever host actually served the page -- including one of Vercel's
    // per-deployment *.vercel.app URLs (a stale bookmark/tab/link; every
    // deploy gets a fresh one, see `vercel ls`). proxy.ts already 308s any
    // *.vercel.app request to the canonical domain, but only on the *next*
    // request -- so a user who started sign-in from vercel.app got a real
    // Google auth, a session cookie scoped to vercel.app, then got bounced
    // to sundaeplanner.com on the very next navigation with no session
    // cookie able to follow across that domain change. That's the
    // "signs in, kicks me out, works on retry" loop: the retry happens
    // after the bounce, once window.location.origin is already canonical.
    // Anchoring to the canonical URL here means the whole OAuth round trip
    // -- and the cookie it sets -- always lands on the one domain that
    // actually serves the signed-in app, on the first attempt.
    const redirectTo = new URL("/auth/callback", getAppUrl());
    if (next) redirectTo.searchParams.set("next", next);
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: redirectTo.toString(),
        scopes: CALENDAR_SCOPE,
        // access_type=offline + prompt=consent guarantees Google issues a
        // refresh_token so we can mint new access tokens without the user
        // signing in again.
        queryParams: { access_type: "offline", prompt: "consent" },
      },
    });
  }

  return (
    <button
      onClick={signInWithGoogle}
      disabled={loading}
      className={
        className ??
        "inline-flex items-center gap-2 rounded-full bg-black px-6 py-3 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:opacity-60 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
      }
    >
      <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z" />
        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z" />
        <path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84z" />
        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.3 9.14 5.38 12 5.38z" />
      </svg>
      {loading ? "Redirecting…" : label}
    </button>
  );
}
