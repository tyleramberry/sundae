-- Spec #2 (Weekly Score as Dashboard Hero). Adds a single integer
-- column to weekly_session_transcripts so the confirm-write path can
-- persist that session's master score, and the dashboard sparkline can
-- pull the last 6 sessions' scores as historical data.
--
-- The PRD called the target table `weekly_sessions`, but Sundae doesn't
-- have that table -- weekly_session_transcripts is the one-row-per-user
-- -per-week row that already carries completed_at and per-round state,
-- which is the right home for this column too.
--
-- Manual step: run this against the production Supabase database (SQL
-- editor or psql) BEFORE the app ships master_score. IF NOT EXISTS
-- means it's safe to re-run.
ALTER TABLE weekly_session_transcripts
  ADD COLUMN IF NOT EXISTS master_score INTEGER;
