-- Stores every Habit/Goal/Project item produced by a weekly session (see
-- docs/weekly-session-flow.md and src/lib/engine/weeklySession.ts). One row
-- per confirmed action per week -- never per role, never per session.
--
-- Rows are never deleted once a week ends. A block that gets removed from
-- the calendar before it's done is marked via removed_at (set by Day 11's
-- reconciliation cron), not dropped -- this is what makes both the current
-- week's KPI dashboard (Day 12) and the 6-week trend view (Day 15) possible
-- from the exact same records, just grouped differently.
create table if not exists public.weekly_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null,
  week_start date not null, -- Sunday-anchored; reuse startOfWeek() from src/lib/google/calendar.ts
  type text not null check (type in ('habit', 'goal', 'project')),
  title text not null,
  google_event_id text,      -- set once the block is confirmed & written; null for 'project'
  done boolean not null default false, -- used by habit/goal
  percent integer,           -- used by project only, 0-100
  removed_at timestamptz,    -- set by Day 11's reconciliation job; excluded from all KPI counts once set
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.weekly_items enable row level security;

create policy "Users can view their own weekly items"
  on public.weekly_items for select
  using (auth.uid() = user_id);

create policy "Users can insert their own weekly items"
  on public.weekly_items for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own weekly items"
  on public.weekly_items for update
  using (auth.uid() = user_id);

-- Tables created outside Supabase's default-privilege setup don't inherit
-- grants for the API roles (same gap hit by google_tokens on Day 5 and
-- onboarding_answers on Day 6). Deliberately no delete grant/policy --
-- rows are never deleted, only removed_at gets set (see header comment).
grant select, insert, update on public.weekly_items to authenticated;
grant select, insert, update on public.weekly_items to service_role;

-- Dashboard (Day 12) and trend view (Day 15) both query "this user, this
-- role or all roles, this/last-N week_start(s)" -- index the lookup shape
-- they'll actually use.
create index if not exists weekly_items_user_week_idx
  on public.weekly_items (user_id, week_start);
