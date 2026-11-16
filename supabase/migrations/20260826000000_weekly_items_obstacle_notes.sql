-- "What got in the way" diagnostic (Stage 1 rollover review -- see the
-- Stage 1 instructions in src/lib/engine/weeklySession.ts). Written onto
-- THIS week's row for an item rolling over from an unfinished last-week
-- item, so the NEXT week's Stage 1 can read it back off `weekly_items`
-- (see getLastWeekContext in src/lib/weeklySession/persist.ts) and open
-- with a specific callback ("last week you said X got in the way, and you
-- were going to try Y -- how'd that go?") instead of the generic rollover
-- question. Nullable -- most items are never diagnosed (nothing to roll
-- over, or rolled over clean) and most weeks these stay empty.
alter table public.weekly_items
  add column if not exists obstacle_note text,
  add column if not exists mitigation_plan text;
