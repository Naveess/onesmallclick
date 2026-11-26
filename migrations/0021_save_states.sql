-- Phase A1b: player save states (decision 35) and name history.
-- Apply with: npx wrangler d1 migrations apply onesmallclick --remote   (or --local for npm run dev)

-- The index of every save state. The files themselves are gzipped JSON in the R2 bucket onesmallclick-snapshots
-- (binding SNAPSHOTS). Player files are under players/, which a lifecycle rule deletes after 90 days; the index rows
-- go at the same age (worker/fixes.ts prunes them).
CREATE TABLE snapshots (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  kind       TEXT NOT NULL,          -- 'player' (A1b); later 'players-daily' (A1b-2) and 'game' (A1c)
  player_key TEXT,                   -- 'a:<account id>' or a guest's device id
  at         INTEGER NOT NULL,
  reason     TEXT NOT NULL,          -- why it was taken: 'before set', 'before undo', ...
  admin      TEXT,                   -- who caused it, if an admin did
  file       TEXT NOT NULL,          -- the R2 key
  bytes      INTEGER NOT NULL
);
CREATE INDEX snapshots_by_player ON snapshots (player_key, at DESC);
CREATE INDEX snapshots_by_at ON snapshots (at);

-- Every name change from now on: the player's own pick, or an admin's.
CREATE TABLE name_history (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  player_key TEXT NOT NULL,
  at         INTEGER NOT NULL,
  old_name   TEXT,
  new_name   TEXT NOT NULL,
  changed_by TEXT NOT NULL           -- 'player', or the admin's email
);
CREATE INDEX name_history_by_player ON name_history (player_key, at DESC);
