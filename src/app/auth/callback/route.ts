import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { saveGoogleTokens } from "@/lib/google/tokens";
import { getOnboardingAnswers } from "@/lib/onboarding/persist";
import { getOnboardingSurveyAnswers } from "@/lib/onboardingSurvey/persist";
import {
  isOnboardingPath,
  isProductOnboardingComplete,
  resolvePostAuthDestination,
} from "@/lib/onboarding/status";
import { isBillingEnforced, isSubscriptionEntitled, type SubscriptionRow } from "@/lib/trial";
import { captureServerEvent } from "@/lib/analytics/server";
import { appendSearchParam, isNewSignup } from "@/lib/analytics/signup";
import { safeNext } from "@/lib/auth/safeNext";

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

  // unknown on lookup failure so a returning login never looks like a
  // first-time signup just because google_tokens was unreachable.
  let tokenLookup: "missing" | "present" | "unknown" = "unknown";
  try {
    const { data: existingTokens } = await supabase
      .from("google_tokens")
      .select("user_id")
      .eq("user_id", user.id)
      .maybeSingle();
    tokenLookup = existingTokens ? "present" : "missing";
  } catch (err) {
    console.error("[auth/callback] failed to read google_tokens:", err);
  }

  const newSignup = isNewSignup(user.created_at) || tokenLookup === "missing";

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

  // An explicit deep-link destination wins, except next=/onboarding for a
  // user who already finished the product onboarding -- that stale next is
  // what the unsigned /onboarding page itself sets, and must not send them
  // through the survey again. Completion lives on the user row
  // (onboarding_survey.completed_at / demo_goal_text, or the older
  // onboarding_answers Stage 0 row). Logout only clears the session.
  let destination = next;
  if (!destination || isOnboardingPath(destination)) {
    let answers = null;
    let survey = null;
    try {
      answers = await getOnboardingAnswers(supabase, user.id);
    } catch (err) {
      console.error("[auth/callback] failed to read onboarding answers:", err);
    }
    try {
      survey = await getOnboardingSurveyAnswers(supabase, user.id);
    } catch (err) {
      console.error("[auth/callback] failed to read onboarding survey:", err);
    }
    const onboardingComplete = isProductOnboardingComplete({
      survey,
      hasOnboardingAnswers: Boolean(answers),
    });
    destination = resolvePostAuthDestination({
      next: destination,
      onboardingComplete,
    });
  }

  destination = await applyBillingRedirect(supabase, user.id, destination);

  if (newSignup) {
    destination = appendSearchParam(destination, "meta", "lead");
    try {
      await captureServerEvent({
        distinctId: user.id,
        event: "signup_completed",
      });
    } catch (err) {
      console.error("[auth/callback] signup_completed analytics failed:", err);
    }
  }

  return NextResponse.redirect(`${origin}${destination}`);
}

function isAppDestination(path: string): boolean {
  return (
    path === "/dashboard" ||
    path.startsWith("/dashboard/") ||
    path === "/weekly-session" ||
    path.startsWith("/weekly-session/") ||
    path === "/daily-follow-ups" ||
    path.startsWith("/daily-follow-ups/")
  );
}

async function applyBillingRedirect(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  destination: string,
): Promise<string> {
  if (!isBillingEnforced()) return destination;
  if (isOnboardingPath(destination)) return destination;
  if (destination === "/subscribe" || destination.startsWith("/subscribe?")) return destination;
  if (!isAppDestination(destination)) return destination;

  try {
    const { data: sub } = await supabase
      .from("subscriptions")
      .select(
        "id, user_id, stripe_customer_id, stripe_subscription_id, status, trial_end, current_period_end, cancel_at_period_end, created_at, updated_at",
      )
      .eq("user_id", userId)
      .maybeSingle();

    if (!isSubscriptionEntitled(sub as SubscriptionRow | null)) {
      return "/subscribe";
    }
  } catch (err) {
    console.error("[auth/callback] failed to read subscription:", err);
    return "/subscribe";
  }

  return destination;
}
