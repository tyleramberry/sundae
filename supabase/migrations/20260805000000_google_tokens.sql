-- Stores Google OAuth tokens (Calendar scope) per user, separate from the
-- Supabase Auth session since provider tokens are only surfaced once at
-- sign-in time and are not persisted by Supabase itself.
create table if not exists public.google_tokens (
  user_id uuid primary key references auth.users (id) on delete cascade,
  access_token text not null,
  refresh_token text,
  expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);

alter table public.google_tokens enable row level security;

create policy "Users can view their own Google tokens"
  on public.google_tokens for select
  using (auth.uid() = user_id);

create policy "Users can upsert their own Google tokens"
  on public.google_tokens for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own Google tokens"
  on public.google_tokens for update
  using (auth.uid() = user_id);
