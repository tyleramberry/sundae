-- Onboarding survey answers (Day 7 onboarding redesign): the new
-- attribution/motivation/context questions asked before the live demo.
-- Deliberately separate from `onboarding_answers` (20260806000000) rather
-- than columns bolted onto it: this table is written incrementally, one
-- screen at a time, so a user who answers the survey but drops off before
-- finishing the rest of onboarding still leaves usable funnel data (see
-- the Day 21 analytics work in docs/30-Day-Calendar.md). `onboarding_answers`
-- is still only written on full completion of Stage 0 (see
-- docs/weekly-session-flow.md) -- that boundary doesn't change here.
--
-- `weekly_roles` here is survey/context only -- NOT the functional role
-- list the engine plans against. That now comes from the weekly session's
-- Stage 0 conversation and lands in `onboarding_answers.roles` instead.
create table if not exists public.onboarding_survey (
  user_id uuid primary key references auth.users (id) on delete cascade,
  heard_from text,
  weekly_roles text[] not null default '{}',
  goals_for_sundae text[] not null default '{}',
  demo_goal_text text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.onboarding_survey enable row level security;

create policy "Users can view their own onboarding survey answers"
  on public.onboarding_survey for select
  using (auth.uid() = user_id);

create policy "Users can upsert their own onboarding survey answers"
  on public.onboarding_survey for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own onboarding survey answers"
  on public.onboarding_survey for update
  using (auth.uid() = user_id);

-- Same gap as onboarding_answers/google_tokens -- tables created outside
-- Supabase's default-privilege setup don't inherit grants for API roles.
grant select, insert, update, delete on public.onboarding_survey to authenticated;
grant select, insert, update, delete on public.onboarding_survey to service_role;
