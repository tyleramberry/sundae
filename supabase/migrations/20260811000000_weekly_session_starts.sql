-- Tracks each real weekly-session start (Day 11 rate limiting -- added Day
-- 10, after a real cost-exposure discussion: nothing stops a signed-in
-- subscriber from scripting /api/weekly-session/step into an unbounded
-- loop of real Claude calls, since the stateless engine trusts whatever
-- `state` the client sends back). A row is inserted only once the first
-- turn of a fresh session actually completes against the real engine, so a
-- failed first attempt doesn't burn the day's quota (see
-- src/lib/weeklySession/throttle.ts). "Does a row exist for this user
-- today" is the session-start throttle -- the product is a once-a-week
-- guided flow by design, so one real start per day is not a UX loss.
create table if not exists public.weekly_session_starts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  started_at timestamptz not null default now()
);

alter table public.weekly_session_starts enable row level security;

create policy "Users can view their own session starts"
  on public.weekly_session_starts for select
  using (auth.uid() = user_id);

create policy "Users can insert their own session starts"
  on public.weekly_session_starts for insert
  with check (auth.uid() = user_id);

-- Same grants gap as every other table in this repo (google_tokens,
-- onboarding_answers, weekly_items) -- tables created outside Supabase's
-- default-privilege setup don't inherit grants for the API roles.
-- Deliberately no update/delete: rows are an append-only start log.
grant select, insert on public.weekly_session_starts to authenticated;
grant select, insert on public.weekly_session_starts to service_role;

-- The throttle check's exact query shape: "this user, since midnight."
create index if not exists weekly_session_starts_user_started_idx
  on public.weekly_session_starts (user_id, started_at);
