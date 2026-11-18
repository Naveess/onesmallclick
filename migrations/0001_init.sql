-- Phase 4: devices, missions and each device's km per day.
-- Apply with: npx wrangler d1 migrations apply onesmallclick --remote   (or --local for npm run dev)

-- One row per anonymous device (the signed cookie). Accounts arrive in phase 8.
CREATE TABLE devices (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  country    TEXT,
  created_at INTEGER NOT NULL, -- epoch ms
  last_seen  INTEGER NOT NULL  -- epoch ms
);

-- One row per mission. The live distance is in the Probe Durable Object; this is the record.
CREATE TABLE missions (
  id          INTEGER PRIMARY KEY,
  destination TEXT NOT NULL,
  route_km    REAL NOT NULL,
  started_at  INTEGER NOT NULL,
  arrived_at  INTEGER
);

-- Km each device pushed per UTC day. Filled from phase 4; the leaderboards read it in phase 8.
CREATE TABLE daily_km (
  day       TEXT NOT NULL, -- YYYY-MM-DD (UTC)
  device_id TEXT NOT NULL,
  km        REAL NOT NULL DEFAULT 0,
  tap_km    REAL NOT NULL DEFAULT 0,
  PRIMARY KEY (day, device_id)
);

CREATE INDEX daily_km_by_day ON daily_km (day, km DESC);
