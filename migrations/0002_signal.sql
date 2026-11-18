-- Phase 5: pings and the mission log.
-- Apply with: npx wrangler d1 migrations apply onesmallclick --remote   (or --local for npm run dev)

-- One ping per device per UTC day (the primary key enforces it). account_id is filled from phase 8.
CREATE TABLE pings (
  day          TEXT NOT NULL,    -- YYYY-MM-DD (UTC)
  device_id    TEXT NOT NULL,
  account_id   TEXT,
  mission_id   INTEGER NOT NULL,
  at           INTEGER NOT NULL, -- epoch ms (mission clock)
  seconds_left REAL NOT NULL,    -- 0 when it woke the probe from safe mode
  tier         TEXT NOT NULL,    -- blue | orange | red
  PRIMARY KEY (day, device_id)
);

CREATE INDEX pings_by_device ON pings (device_id, day DESC);

-- The mission log (shown in phase 7). Only notable moments: signal lost, signal restored,
-- and saves in the final 60 seconds. data holds JSON details.
CREATE TABLE log_entries (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  mission_id INTEGER NOT NULL,
  at         INTEGER NOT NULL,
  kind       TEXT NOT NULL,
  title      TEXT NOT NULL,
  body       TEXT,
  data       TEXT
);

CREATE INDEX log_by_mission ON log_entries (mission_id, at DESC);
