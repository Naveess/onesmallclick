-- E4b part 2a (prompts 77-78): the arrival medal, saved with each leg when the probe arrives, so a later change
-- to the medal days never changes an old medal. Passport stamps read mission_crew (who helped on each leg), so
-- they need no table of their own.

ALTER TABLE missions ADD COLUMN medal TEXT; -- gold, silver or bronze; null until the leg arrives

-- Legs that arrived before this (test arrivals on workers.dev): their medal from the days they took.
UPDATE missions SET medal = CASE
    WHEN (arrived_at - started_at) <= 25 * 86400000 THEN 'gold'
    WHEN (arrived_at - started_at) <= 30 * 86400000 THEN 'silver'
    ELSE 'bronze'
  END
WHERE arrived_at IS NOT NULL;
