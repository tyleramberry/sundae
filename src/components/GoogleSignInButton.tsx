"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getAppUrl } from "@/lib/appUrl";

const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar";

// Shared Google OAuth entry point -- used on both the landing page CTA and
// the /login page so there's one definition of the scope + offline-token
// dance. `next` is forwarded to /auth/callback so a deep link
// (e.g. /login?next=/daily-follow-ups) lands where it meant to after login.
//
// Cross-domain safety: the PKCE code verifier that Supabase stores in a
// cookie must be on the same domain where /auth/callback runs
// (app.sundaeplanner.com). When this button renders on the marketing domain
// (sundaeplanner.com), it redirects to app.sundaeplanner.com/login instead
// of starting OAuth directly, so the entire flow — verifier cookie, Google
// redirect, code exchange — stays on one domain.
export default function GoogleSignInButton({
  next,
  label = "Sign in with Google",
  className,
  autoStart = false,
}: {
  next?: string;
  label?: string;
  className?: string;
  /** Auto-start OAuth on mount (used when redirected from landing page). */
  autoStart?: boolean;
}) {
  const [loading, setLoading] = useState(false);

  async function signInWithGoogle() {
    setLoading(true);
    const appUrl = getAppUrl();
    const appHost = new URL(appUrl).host;

    // If we're on a different domain (e.g. the marketing landing page on
    // sundaeplanner.com), redirect to the app domain's login page so the
    // PKCE verifier cookie is set on the same domain as /auth/callback.
    // Without this, the code exchange fails because the cookie is on
    // sundaeplanner.com but the callback runs on app.sundaeplanner.com.
    if (
      typeof window !== "undefined" &&
      window.location.host !== appHost &&
      !window.location.host.startsWith("localhost")
    ) {
      const loginUrl = new URL("/login", appUrl);
      loginUrl.searchParams.set("auto", "google");
      if (next) loginUrl.searchParams.set("next", next);
      window.location.href = loginUrl.toString();
      return;
    }

    const supabase = createClient();
    const redirectTo = new URL("/auth/callback", appUrl);
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

  // When redirected from the landing page with ?auto=google, start OAuth
  // immediately so the user doesn't have to click twice.
  useEffect(() => {
    if (autoStart) signInWithGoogle();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
