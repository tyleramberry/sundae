-- Explicit "finished the /onboarding survey -> demo -> hype flow" flag.
--
-- After the Day 7 redesign, completing /onboarding writes onboarding_survey
-- (incrementally) and never touches onboarding_answers -- that table is now
-- Stage 0 of the weekly session. Post-login routing used to treat
-- onboarding_answers as "has onboarded", so a user who finished the product
-- onboarding, logged out, and logged back in was sent through /onboarding
-- again. completed_at is the durable per-user signal that flow is done.
--
-- Backfill: demo_goal_text is only written after the live demo, the last
-- persisted screen of /onboarding, so existing rows with it have already
-- finished the flow even without a click on the hype CTA.
alter table public.onboarding_survey
  add column if not exists completed_at timestamptz;

update public.onboarding_survey
  set completed_at = coalesce(updated_at, created_at, now())
  where completed_at is null
    and demo_goal_text is not null
    and btrim(demo_goal_text) <> '';
