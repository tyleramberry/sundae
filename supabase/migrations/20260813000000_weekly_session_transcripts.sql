-- Persists the weekly-session chat itself (Day 16 feature) -- separate
-- from weekly_items, which is the plan's *output*, not the conversation
-- that produced it. Two states tracked per user per week:
--
--   - display_turns: the full chat the user sees, in the web UI's Turn
--     shape ({from: "engine"|"user", text}). Append-only across the whole
--     week -- never reset once a message lands -- so "go back and re-look
--     at the chat" always has the complete history for that week,
--     including every mid-week addition.
--   - active_state: the *live* engine ConversationState ({turns: [...]},
--     src/lib/engine/types.ts's shape) that actually gets round-tripped
--     into Claude. Mirrors display_turns while the original full session
--     is still in progress, but gets reset to {"turns": []} every time
--     /confirm writes a plan -- so a later mid-week addition starts Claude
--     with a small, scoped conversation instead of replaying the entire
--     week's history back into the model. This is a correctness choice,
--     not just a cost one: a model re-reading the whole week's chat could
--     re-list an already-confirmed item in a fresh `actions` array and
--     cause a duplicate calendar write. Past that point, display_turns is
--     purely a display concern -- it's never fed back into Claude.
--   - actions_so_far: the current round's in-progress classified actions
--     (mirrors WeeklySessionOutput.actionsSoFar), so a mid-round refresh
--     doesn't lose progress on the audit-trail panel either.
--
-- completed_at is set once the first full session of the week is
-- confirmed & written, and never touched again after that -- the step
-- route uses "is this null" to pick the engine's system prompt (full
-- session vs. mid-week addendum, see weeklySession.ts).
--
-- One row per user per week (week_start, Sunday-anchored -- same
-- convention as weekly_items, reuse startOfWeek() from
-- src/lib/google/calendar.ts). A row is only ever looked up for its own
-- week: once the app computes a new week_start (Sunday 00:00, i.e.
-- "through Sunday night" per the product ask), last week's row is simply
-- never queried again -- no expiry job needed. Nothing deletes it.
create table if not exists public.weekly_session_transcripts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  week_start date not null,
  display_turns jsonb not null default '[]'::jsonb,
  active_state jsonb not null default '{"turns": []}'::jsonb,
  actions_so_far jsonb not null default '[]'::jsonb,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, week_start)
);

alter table public.weekly_session_transcripts enable row level security;

create policy "Users can view their own weekly session transcripts"
  on public.weekly_session_transcripts for select
  using (auth.uid() = user_id);

create policy "Users can insert their own weekly session transcripts"
  on public.weekly_session_transcripts for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own weekly session transcripts"
  on public.weekly_session_transcripts for update
  using (auth.uid() = user_id);

-- Same grants gap as every other table in this repo (google_tokens,
-- onboarding_answers, weekly_items, weekly_session_starts) -- tables
-- created outside Supabase's default-privilege setup don't inherit grants
-- for the API roles. Deliberately no delete grant/policy, same "never
-- delete" stance as weekly_items.
grant select, insert, update on public.weekly_session_transcripts to authenticated;
grant select, insert, update on public.weekly_session_transcripts to service_role;

-- No separate index needed: the unique constraint on (user_id, week_start)
-- already covers the step/transcript routes' exact lookup shape.
