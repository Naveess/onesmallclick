-- Phase S1 (prompt 62): crew links and share counts (shared/share.ts, worker/share.ts).
-- A crew link (/c/<code>) belongs to one player: the account (a:<id>) when signed in, else the device.
-- The code is short and random, never the name or email. A row is made the first time a player shares.
CREATE TABLE share_links (
  code       TEXT PRIMARY KEY,
  player_key TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL
);

-- Counters only, with no personal data: shares made (a share button pressed) and visits (a crew link
-- opened in the game, counted by the app, so link-preview robots don't count) per UTC day, moment and channel.
CREATE TABLE share_counts (
  day     TEXT NOT NULL,    -- YYYY-MM-DD (UTC), as daily_km
  moment  TEXT NOT NULL,    -- shared/share.ts MOMENTS
  channel TEXT NOT NULL,    -- shared/share.ts CHANNELS
  shares  INTEGER NOT NULL DEFAULT 0,
  visits  INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, moment, channel)
);
