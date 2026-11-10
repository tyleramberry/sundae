-- M1 (entitlement lock): make `completed_at` and `active_state` on
-- public.weekly_session_transcripts server-owned.
--
-- What the freemium gate reads. src/lib/weeklySession/freeTier.ts
-- getFreeLimitBlock() decides whether a request may drive a brand-new full
-- weekly session by reading this week's transcript row:
--   * roundTurnCount = active_state -> 'turns' length (an in-progress round
--     may always finish), and
--   * weekCompleted  = completed_at is set (addendum rounds in an already
--     completed week are free and unlimited).
-- Those rules are the designed behaviour. The hole was that both inputs were
-- writable by the caller.
--
-- The attack. 20260813000000_weekly_session_transcripts.sql grants
-- select/insert/update to `authenticated` and its RLS policies pin only
-- user_id. A signed-in, non-entitled, at-limit user could therefore POST or
-- PATCH their own transcript row through PostgREST with active_state.turns
-- (or completed_at) set, and /api/weekly-session/step would go 402 -> 200
-- (real Claude spend); /propose + /confirm would then write weekly_items
-- rows and Google Calendar events for a brand-new week.
--
-- The fix. These two columns decide entitlement, so `authenticated` may not
-- write them. This BEFORE INSERT OR UPDATE trigger refuses (errcode 42501)
-- any non-service_role caller that sets or changes either one.
-- `service_role` is the only writer: the app's server-side writes
-- (saveWeeklySessionTranscript / recordWeeklySessionConfirmed in
-- src/lib/weeklySession/persist.ts) now go through the service-role client.
-- Precedent: 20261107000000_subscriptions_customer_binding.sql (M3/S-1),
-- which freezes subscriptions.stripe_customer_id the same way, using
-- coalesce(auth.role(), '') = 'service_role'.
--
-- Rules:
--   * service_role: always allowed.
--   * INSERT by anyone else: completed_at must be null and active_state must
--     be exactly the empty default '{"turns": []}'. Not "must not be a
--     non-empty turns array": freeTier.ts roundStateOf reads
--     `active_state.turns.length`, so a 'turns' that is not an array (the
--     string "nope" has length 4) reads as a non-zero turn count and skips
--     the gate. Anything other than the empty default is therefore refused.
--     tryBeginConfirm's insert leaves the column at its default and is the
--     only client-side INSERT this repo makes.
--   * UPDATE by anyone else: completed_at and active_state must be unchanged.
--
-- Deliberately NOT constrained (not entitlement inputs, stay writable by
-- `authenticated`): display_turns, actions_so_far, round_seq, confirming_at,
-- pending_proposed, pending_session_actions. tryBeginConfirm's insert (writes
-- only user_id, week_start, confirming_at, updated_at -- active_state stays at
-- its empty default, completed_at null), savePendingProposal and
-- clearConfirmingAt keep working unchanged.
--
-- Verification status: this DDL was executed against a local WASM Postgres
-- (PGlite, Postgres 17) with Supabase's own auth.uid()/auth.role() definitions
-- emulated from session GUCs and `authenticated` / `service_role` (bypassrls)
-- roles created by hand -- every attack and legitimate-write probe in the
-- handing-off card's evidence log behaved as specified. That is NOT a Supabase
-- instance: the RLS policies and the PostgREST path are emulated, not
-- reproduced, so apply this through the normal Supabase migration path and
-- re-verify there before relying on it.
create or replace function public.weekly_session_transcripts_lock_entitlement()
returns trigger
language plpgsql
security invoker
as $$
begin
  if coalesce(auth.role(), '') = 'service_role' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.completed_at is not null then
      raise exception
        'completed_at is server-owned on public.weekly_session_transcripts'
        using errcode = '42501';
    end if;
    if new.active_state is distinct from '{"turns": []}'::jsonb then
      raise exception
        'active_state is server-owned on public.weekly_session_transcripts'
        using errcode = '42501';
    end if;
  else
    if new.completed_at is distinct from old.completed_at then
      raise exception
        'completed_at is server-owned on public.weekly_session_transcripts'
        using errcode = '42501';
    end if;
    if new.active_state is distinct from old.active_state then
      raise exception
        'active_state is server-owned on public.weekly_session_transcripts'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists weekly_session_transcripts_lock_entitlement
  on public.weekly_session_transcripts;

create trigger weekly_session_transcripts_lock_entitlement
  before insert or update on public.weekly_session_transcripts
  for each row
  execute function public.weekly_session_transcripts_lock_entitlement();
