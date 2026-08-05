import type { SupabaseClient } from "@supabase/supabase-js";

export type GoogleTokenRow = {
  user_id: string;
  access_token: string;
  refresh_token: string | null;
  expires_at: string;
  updated_at: string;
};

type SaveGoogleTokensInput = {
  userId: string;
  accessToken: string;
  refreshToken: string | null;
  expiresAt: string;
};

// Upserts the caller's Google tokens. Google only reissues a refresh_token
// when the user re-consents (we force that with prompt=consent), so on a
// row that already exists we keep the old refresh_token if this exchange
// didn't hand us a new one.
export async function saveGoogleTokens(
  supabase: SupabaseClient,
  { userId, accessToken, refreshToken, expiresAt }: SaveGoogleTokensInput,
) {
  const { data: existing } = await supabase
    .from("google_tokens")
    .select("refresh_token")
    .eq("user_id", userId)
    .maybeSingle();

  const { error } = await supabase.from("google_tokens").upsert(
    {
      user_id: userId,
      access_token: accessToken,
      refresh_token: refreshToken ?? existing?.refresh_token ?? null,
      expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );

  if (error) {
    throw new Error(`Failed to save Google tokens: ${error.message}`);
  }
}

export async function getGoogleTokens(
  supabase: SupabaseClient,
  userId: string,
): Promise<GoogleTokenRow | null> {
  const { data, error } = await supabase
    .from("google_tokens")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load Google tokens: ${error.message}`);
  }

  return data;
}
