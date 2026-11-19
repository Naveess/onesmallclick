-- Phase 7a: the daily crew vote. The Probe Durable Object runs the open round (live tallies in its
-- own SQLite); these are the records. A round is a UTC day ("2026-11-19"), or "2026-11-19.2" if
-- /admin closed one early.
CREATE TABLE vote_days (
  round        TEXT PRIMARY KEY,
  mission_id   INTEGER NOT NULL,
  opened_at    INTEGER NOT NULL,
  closes_at    INTEGER NOT NULL,
  options      TEXT NOT NULL,  -- JSON array of option ids (content/vote-options.json)
  tallies      TEXT NOT NULL,  -- JSON array of counts, same order
  winner       INTEGER,        -- index into options; -1 = no votes; NULL while open
  effect_hours REAL,
  closed_at    INTEGER
);

-- One vote per device per round (account_id from phase 8).
CREATE TABLE votes (
  round      TEXT NOT NULL,
  device_id  TEXT NOT NULL,
  account_id TEXT,
  option     INTEGER NOT NULL,
  at         INTEGER NOT NULL,
  PRIMARY KEY (round, device_id)
);
CREATE INDEX votes_by_device ON votes (device_id);
