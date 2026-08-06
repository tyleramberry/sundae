import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { saveGoogleTokens } from "@/lib/google/tokens";

// Google OAuth redirects here with a `code`. We exchange it for a Supabase
// session, then pull the Google provider tokens off that exchange (they're
// only ever surfaced at this moment) and persist them to google_tokens.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/onboarding";

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
    await saveGoogleTokens(supabase, {
      userId: user.id,
      accessToken: provider_token,
      refreshToken: provider_refresh_token ?? null,
      expiresAt,
    });
  }

  return NextResponse.redirect(`${origin}${next}`);
}
