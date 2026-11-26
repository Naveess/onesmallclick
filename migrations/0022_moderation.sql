-- Phase A2a: moderation (decisions 36-40 and 45). Apply with: npx wrangler d1 migrations apply onesmallclick --remote

-- Every warning, time out, hide and ban. Kept 1 year (decision 40); an active ban or hide is kept while it's active.
CREATE TABLE moderation (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  player_key  TEXT NOT NULL,      -- 'a:<account id>' or a guest's device id
  kind        TEXT NOT NULL,      -- warn | timeout | hide | ban
  reason      TEXT NOT NULL,      -- shown to the player
  at          INTEGER NOT NULL,
  until       INTEGER,            -- a time out's end; NULL = until lifted (ban, hide) or not timed (warn)
  net_days    INTEGER,            -- a ban: also the network it's next seen on, for this many days (1-7)
  admin       TEXT NOT NULL,
  lifted_at   INTEGER,
  lifted_by   TEXT,
  lift_reason TEXT,
  acked_at    INTEGER             -- a warning: when the player tapped OK
);
CREATE INDEX moderation_by_key ON moderation (player_key, at DESC);
CREATE INDEX moderation_by_at ON moderation (at);

-- The devices an account's time out or ban covers (its devices when it was given), so signing out doesn't escape it.
CREATE TABLE moderation_devices (
  mod_id    INTEGER NOT NULL,
  device_id TEXT NOT NULL,
  PRIMARY KEY (device_id, mod_id)
);

-- A banned network: a fixed HMAC of the network (never the address), taken the next time the banned player visits,
-- banned for the ban's net_days from then (at most 7; decision 36).
CREATE TABLE network_bans (
  net_hash TEXT PRIMARY KEY,
  mod_id   INTEGER NOT NULL,
  until    INTEGER NOT NULL
);

-- Appeals (decision 45) say who's appealing: the player key, always (they're asking about their own record).
ALTER TABLE feedback ADD COLUMN player_key TEXT;
