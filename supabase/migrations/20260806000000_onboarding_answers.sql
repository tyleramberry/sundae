-- Stores the result of a completed onboarding conversation: the role list
-- and per-role goals/context captured by the planning engine (see
-- src/lib/engine). One row per user — a fresh onboarding run overwrites the
-- previous answers rather than versioning them, matching Day 7 scope.
create table if not exists public.onboarding_answers (
  user_id uuid primary key references auth.users (id) on delete cascade,
  roles text[] not null,
  answers jsonb not null,
  completed_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.onboarding_answers enable row level security;

create policy "Users can view their own onboarding answers"
  on public.onboarding_answers for select
  using (auth.uid() = user_id);

create policy "Users can upsert their own onboarding answers"
  on public.onboarding_answers for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own onboarding answers"
  on public.onboarding_answers for update
  using (auth.uid() = user_id);

-- Tables created outside Supabase's default-privilege setup don't inherit
-- grants for the API roles (same gap hit by google_tokens on Day 5).
grant select, insert, update, delete on public.onboarding_answers to authenticated;
grant select, insert, update, delete on public.onboarding_answers to service_role;
