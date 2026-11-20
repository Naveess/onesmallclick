-- Phase 8c (prompts 45-46): arrival, the mission credits and the Grand Tour's legs.
-- A row in `missions` is one leg of the tour (Earth → Mars is mission 1; the branch vote at Mars starts the next).

ALTER TABLE missions ADD COLUMN stop TEXT;         -- the destination's id in content/campaign.json (mars, ceres, …)
ALTER TABLE missions ADD COLUMN from_stop TEXT;    -- where the leg started (earth, mars, …)
ALTER TABLE missions ADD COLUMN leg_km REAL;       -- the leg's length before setbacks and votes
ALTER TABLE missions ADD COLUMN crew_half REAL;    -- the leg's crew balance (CREW_HALF_KM_S, recalibrated each leg)
ALTER TABLE missions ADD COLUMN crew_count INTEGER; -- everyone who helped (at least one credited tap on the leg)
ALTER TABLE missions ADD COLUMN taps INTEGER;      -- the crew's credited taps on the leg
ALTER TABLE missions ADD COLUMN branch TEXT;       -- the branch vote's winner at this stop, if it had one

-- The mission credits: who helped on each leg (at least one credited THRUST tap), snapshotted at arrival.
-- player_key is the probe's player key ("a:<account id>" signed in, else the device id). Named on the credits
-- only when signed in; guests are counted. Also what E4b's passport stamps will read.
CREATE TABLE mission_crew (
  mission_id INTEGER NOT NULL,
  player_key TEXT NOT NULL,
  account_id TEXT,
  name       TEXT,
  country    TEXT,
  km         REAL NOT NULL,
  taps       INTEGER NOT NULL,
  PRIMARY KEY (mission_id, player_key)
);

CREATE INDEX mission_crew_by_km ON mission_crew (mission_id, km DESC);
