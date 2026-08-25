-- Stripe subscription state per Sundae user. One row per user: Checkout
-- upserts on user_id, webhooks upsert on user_id / stripe_subscription_id.
-- Authenticated clients may SELECT their own row (the (app) layout gate
-- and dashboard trial copy). Writes are webhook/admin only — no insert or
-- update policies for the `authenticated` role.
create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  stripe_customer_id text not null,
  stripe_subscription_id text not null,
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
-- weekly_items on Day 10). Deliberately no insert/update/delete grant for
-- authenticated — only the service-role webhook path writes this table.
grant select on public.subscriptions to authenticated;
grant all on public.subscriptions to service_role;
