-- Table created outside Supabase's default-privilege setup didn't inherit
-- grants for the API roles; add them explicitly.
grant select, insert, update, delete on public.google_tokens to authenticated;
grant select, insert, update, delete on public.google_tokens to service_role;
