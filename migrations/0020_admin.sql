-- Phase A1a: the admin panel's sign-in, its log and its notes on players.
-- Apply with: npx wrangler d1 migrations apply onesmallclick --remote   (or --local for npm run dev)

-- Admin sessions (decision 34): Nav's Google-signed-in account on the ADMIN_EMAILS allowlist, plus ADMIN_KEY.
-- Only a hash of the cookie's token is stored. 12 hours, separate from the player's session.
CREATE TABLE admin_sessions (
  id_hash    TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  email      TEXT NOT NULL,
  role       TEXT NOT NULL,          -- 'owner' or 'moderator'
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

-- Every admin action (and every failed admin sign-in). Kept 1 year (decision 40); never edited from the panel.
CREATE TABLE admin_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  at         INTEGER NOT NULL,
  admin      TEXT NOT NULL,          -- the admin's email, or 'key' (local checks), or 'unknown' for a failed sign-in
  action     TEXT NOT NULL,
  target     TEXT,                   -- a player key ('a:<account id>' or a guest's device id), if any
  reason     TEXT,
  detail     TEXT                    -- JSON: what changed, before and after
);
CREATE INDEX admin_log_by_target ON admin_log (target, at DESC);
CREATE INDEX admin_log_by_at ON admin_log (at DESC);

-- Private notes on a player ("said on Discord his credits vanished, 25 Nov").
CREATE TABLE admin_notes (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  player_key TEXT NOT NULL,
  at         INTEGER NOT NULL,
  admin      TEXT NOT NULL,
  text       TEXT NOT NULL
);
CREATE INDEX admin_notes_by_player ON admin_notes (player_key, at DESC);
