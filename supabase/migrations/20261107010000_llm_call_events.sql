-- One row per Claude call made on a user's behalf; the per-user spend guard
-- (src/lib/llm/spendGuard.ts) counts these over a rolling hour and day. SEC-1
-- finding M2: nothing bounded how many real Claude calls a signed-in account
-- could trigger. Rows are inserted before the call so a crash mid-call still
-- counts.
-- Authenticated clients may SELECT and INSERT their own rows only. There is
-- deliberately no UPDATE or DELETE policy: a user must not be able to clear
-- or rewrite their own counters, or the limit would be self-service to reset.
-- Pruning old rows is service_role's job.
create table if not exists public.llm_call_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  route text not null,
  created_at timestamptz not null default now()
);

create index if not exists llm_call_events_user_id_created_at_idx
  on public.llm_call_events (user_id, created_at desc);

alter table public.llm_call_events enable row level security;

create policy "Users can view their own llm call events"
  on public.llm_call_events for select
  using (auth.uid() = user_id);

create policy "Users can insert their own llm call events"
  on public.llm_call_events for insert
  with check (auth.uid() = user_id);

-- Tables created outside Supabase's default-privilege setup don't inherit
-- grants for the API roles (same gap hit by google_tokens on Day 5 and
-- subscriptions). No update/delete grant for authenticated, matching the
-- absence of policies above.
grant select, insert on public.llm_call_events to authenticated;
grant all on public.llm_call_events to service_role;
