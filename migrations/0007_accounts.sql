-- Phase 8a: accounts and sign-in (email link or Google). Signing in moves the device's progress
-- into the account (the Probe Durable Object merges it) and attaches the device's history.

-- One row per player who signed in. Names are generated (decision 17) and unique; country is
-- detected from Cloudflare's location when the account is made and can be changed once (decision 16).
CREATE TABLE accounts (
  id                 TEXT PRIMARY KEY,
  email              TEXT UNIQUE,          -- lower-cased; from the email link or Google
  google_sub         TEXT UNIQUE,          -- Google's id for the person
  name               TEXT NOT NULL UNIQUE,
  name_chosen        INTEGER NOT NULL DEFAULT 0, -- 0 until the player picks from the offers
  country            TEXT,
  country_changed_at INTEGER,
  created_at         INTEGER NOT NULL
);

-- Signed-in browsers. Only a hash of the cookie's token is stored.
CREATE TABLE sessions (
  id_hash    TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  device_id  TEXT,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX sessions_by_account ON sessions (account_id);

-- Email sign-in links: single use, 15 minutes. Only a hash of the token is stored.
CREATE TABLE login_tokens (
  token_hash TEXT PRIMARY KEY,
  email      TEXT NOT NULL,
  device_id  TEXT,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at    INTEGER
);
CREATE INDEX login_tokens_by_email ON login_tokens (email, created_at);
CREATE INDEX login_tokens_by_device ON login_tokens (device_id, created_at);

-- The account a device is signed in to (NULL for guests), and whose km a day's row counts for.
ALTER TABLE devices ADD COLUMN account_id TEXT;
ALTER TABLE daily_km ADD COLUMN account_id TEXT;
CREATE INDEX daily_km_by_account ON daily_km (account_id, day);

-- Signed in, pings and votes are once per account (Nav, prompt 30).
CREATE INDEX pings_by_account ON pings (account_id, day);
CREATE INDEX votes_by_account ON votes (account_id, round);
