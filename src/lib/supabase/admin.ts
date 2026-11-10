import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// Admin/service-role client (Day 11) -- for the two cron jobs, which run
// with no signed-in user at all and need to see every user's rows,
// bypassing RLS entirely. Distinct from client.ts (browser, anon key) and
// server.ts (per-request, cookie-scoped to one signed-in user): this one
// is scoped to the whole table, so it only belongs in trusted server-only
// code that's already gated behind its own auth check (see
// src/lib/cron/auth.ts) -- never import this into anything that handles a
// single user's request without that gate in front of it.
//
// Second sanctioned use: the weekly-session transcript writes to
// `active_state` / `completed_at` (persist.ts saveWeeklySessionTranscript /
// recordWeeklySessionConfirmed). Those two columns decide freemium
// entitlement, and the entitlement-lock trigger
// (20261110000000_weekly_session_transcripts_entitlement_lock.sql) only lets
// `service_role` write them. Both weekly-session routes (/step, /confirm)
// have already authenticated the user (getUser() + 401) before building this
// client, and every statement it runs is scoped by user_id.
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;

  if (!url || !secretKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY must both be set to create the admin client.",
    );
  }

  return createSupabaseClient(url, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
