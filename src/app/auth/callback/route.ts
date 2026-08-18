import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { saveGoogleTokens } from "@/lib/google/tokens";
import { getOnboardingAnswers } from "@/lib/onboarding/persist";

// Only allow relative in-app paths as a post-login destination, so a
// crafted ?next=https://evil.example can't turn the callback into an open
// redirect.
function safeNext(next: string | null): string | null {
  if (!next) return null;
  if (!next.startsWith("/") || next.startsWith("//")) return null;
  return next;
}

// Google OAuth redirects here with a `code`. We exchange it for a Supabase
// session, then pull the Google provider tokens off that exchange (they're
// only ever surfaced at this moment) and persist them to google_tokens.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const next = safeNext(searchParams.get("next"));

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data.session) {
    return NextResponse.redirect(`${origin}/login?error=exchange_failed`);
  }

  const { provider_token, provider_refresh_token, user } = data.session;

  if (provider_token) {
    // Google access tokens are valid for 1 hour.
    const expiresAt = new Date(Date.now() + 3600 * 1000).toISOString();
    try {
      await saveGoogleTokens(supabase, {
        userId: user.id,
        accessToken: provider_token,
        refreshToken: provider_refresh_token ?? null,
        expiresAt,
      });
    } catch (err) {
      // The Supabase OAuth session is already valid at this point -- token
      // storage failing (network blip, DB timeout) shouldn't strand the user
      // on the callback with a crashed route and no visible outcome. Log it
      // and let sign-in complete; calendar-backed features will error at
      // first use with the existing GoogleCalendarError path and the user
      // can retry sign-in to re-issue the provider tokens.
      console.error("[auth/callback] failed to persist Google tokens:", err);
    }
  }

  // An explicit deep-link destination wins. Otherwise, route new users into
  // onboarding (survey -> demo -> hype -> Stage 0) and returning users --
  // anyone who's already completed Stage 0, so `onboarding_answers` exists --
  // straight into the app, defaulting to the dashboard.
  let destination = next;
  if (!destination) {
    try {
      const answers = await getOnboardingAnswers(supabase, user.id);
      destination = answers ? "/dashboard" : "/onboarding";
    } catch (err) {
      // Same reasoning: session is already valid. If we can't tell whether
      // they've onboarded, /onboarding is the safer fallback -- /dashboard
      // would fail anyway if the DB is unreachable, and /onboarding is
      // self-guarding for the returning-user case.
      console.error("[auth/callback] failed to read onboarding answers:", err);
      destination = "/onboarding";
    }
  }

  return NextResponse.redirect(`${origin}${destination}`);
}
