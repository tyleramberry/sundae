-- Confirm-lock + stale-step protection for weekly_session_transcripts.
--
-- round_seq increments every time /confirm finishes a round. /step loads
-- the seq at the start of the turn and the save only lands if it still
-- matches, so a Claude call that started before confirm cannot upsert the
-- pre-confirm active_state back over the reset row.
--
-- confirming_at is a compare-and-swap lock so two Confirm clicks cannot
-- both write Google Calendar events. last_confirm_fingerprint lets a
-- retry of an already-successful confirm return ok instead of duplicating.
--
-- pending_proposed / pending_session_actions hold the confirm-screen plan
-- so a reload mid-review restores the calendar grid instead of dropping
-- back into chat.
alter table public.weekly_session_transcripts
  add column if not exists round_seq integer not null default 0,
  add column if not exists confirming_at timestamptz,
  add column if not exists last_confirm_fingerprint text,
  add column if not exists pending_proposed jsonb,
  add column if not exists pending_session_actions jsonb;
