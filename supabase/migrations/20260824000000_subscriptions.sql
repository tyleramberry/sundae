-- Stripe subscription state per Sundae user. One row per user: Checkout
-- upserts on user_id, webhooks upsert on user_id / stripe_subscription_id.
-- Authenticated clients may SELECT their own row (layout gate, dashboard,
-- checkout-success polling). They may INSERT/UPDATE only with status
-- `incomplete` (pending Checkout). The webhook (service_role) writes
-- trialing/active/canceled.
create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  stripe_customer_id text not null,
  -- Nullable until checkout.session.completed: Checkout persists an
  -- incomplete row (user + customer) before the session URL is returned,
  -- and Stripe has not created a subscription id yet. UNIQUE still applies
  -- to non-null values; Postgres allows multiple NULLs.
  stripe_subscription_id text,
  status text not null,
  trial_end timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id),
  unique (stripe_subscription_id)
);

create index if not exists subscriptions_stripe_customer_id_idx
  on public.subscriptions (stripe_customer_id);

alter table public.subscriptions enable row level security;

create policy "Users can view their own subscription"
  on public.subscriptions for select
  using (auth.uid() = user_id);

-- Tables created outside Supabase's default-privilege setup don't inherit
-- grants for the API roles (same gap hit by google_tokens on Day 5 and
-- weekly_items on Day 10). Authenticated write grants exist only so
-- Checkout can persist a pending incomplete row; RLS still forbids
-- setting trialing/active from the user session.
grant select, insert, update on public.subscriptions to authenticated;
grant all on public.subscriptions to service_role;

create policy "Users can insert their own incomplete checkout row"
  on public.subscriptions for insert
  with check (auth.uid() = user_id and status = 'incomplete');

create policy "Users can update their row to incomplete for a new checkout"
  on public.subscriptions for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id and status = 'incomplete');
