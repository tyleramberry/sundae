-- M3 (SEC-1): the Stripe Customer id on a subscription row is the billing
-- identity, and `authenticated` may write that row (see
-- 20260824000000_subscriptions.sql). Those write policies constrain user_id
-- and status but never stripe_customer_id, so a signed-in user could point
-- their own row at someone else's opaque `cus_…` id and then have
-- /api/stripe/portal open that customer's billing portal — invoices, card
-- last4, billing address/email, cancel/change plan.
--
-- The binding is therefore set once, at checkout INSERT (still allowed
-- below), and afterwards frozen: any UPDATE that changes
-- stripe_customer_id is refused unless the caller is the service role,
-- which is how the Stripe webhook, /api/stripe/status and the cron/admin
-- paths write. Application code has a second, server-side check
-- (src/lib/stripe/checkout.ts + the portal/checkout routes); this trigger is
-- the database-level backstop that a client cannot reach around.
create or replace function public.subscriptions_lock_customer_binding()
returns trigger
language plpgsql
security invoker
as $$
begin
  if new.stripe_customer_id is distinct from old.stripe_customer_id
    and coalesce(auth.role(), '') <> 'service_role'
  then
    raise exception
      'stripe_customer_id is immutable once set on public.subscriptions'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists subscriptions_lock_customer_binding on public.subscriptions;

create trigger subscriptions_lock_customer_binding
  before update on public.subscriptions
  for each row
  execute function public.subscriptions_lock_customer_binding();
