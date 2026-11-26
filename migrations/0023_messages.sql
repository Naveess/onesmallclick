-- Phase A2b-1: messages from mission control (the in-game inbox), with gifts. Decisions 39 and 40.
-- Apply with: npx wrangler d1 migrations apply onesmallclick --remote

-- Every message. To one player ('a:<account id>' or a guest's device id), or to everyone (to_key NULL): an everyone
-- message shows only to players who existed when it was sent. Kept 90 days (decision 40).
CREATE TABLE messages (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  to_key           TEXT,              -- NULL = everyone
  title            TEXT NOT NULL,
  body             TEXT NOT NULL,
  template         TEXT,              -- which template it started from, if any
  gift_credits     INTEGER,           -- a gift of whole credits, paid when the player taps Collect
  gift_badge       TEXT,              -- or a badge
  at               INTEGER NOT NULL,
  admin            TEXT NOT NULL,
  reason           TEXT NOT NULL,     -- for the admin log, never shown to the player
  withdrawn_at     INTEGER,           -- hidden from anyone who hasn't opened it; no more collecting
  withdrawn_by     TEXT,
  gift_stopped_at  INTEGER,           -- an everyone gift's Undo: no more collecting (the message stays)
  gift_stopped_by  TEXT
);
CREATE INDEX messages_by_to ON messages (to_key, at DESC);
CREATE INDEX messages_by_at ON messages (at);

-- Who read each message, and who collected its gift (once per player: the check also looks at the player's other keys,
-- so a guest who collects and then signs in can't collect again).
CREATE TABLE message_reads (
  message_id        INTEGER NOT NULL,
  player_key        TEXT NOT NULL,
  read_at           INTEGER,
  collected_at      INTEGER,
  collected_credits INTEGER,          -- what was paid
  badge_new         INTEGER,          -- 1 if the gift's badge was new to them (Undo only takes away a new one)
  save_state        TEXT,             -- a one-player gift: the save state taken just before it was paid
  taken_back_at     INTEGER,
  taken_back_credits INTEGER,         -- what Undo took back (less than paid if they'd spent it)
  PRIMARY KEY (message_id, player_key)
);
CREATE INDEX message_reads_by_key ON message_reads (player_key);
