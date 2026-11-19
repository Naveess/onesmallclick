-- Phase 6: each device's idle game. The Probe Durable Object is the authority (its own SQLite);
-- this is the copy it flushes every 30 s, for /admin queries and for merging into accounts in phase 8.
-- Credits are thousandths of a credit, as whole numbers, so they never drift.
CREATE TABLE progress (
  device_id      TEXT PRIMARY KEY,
  credits_milli  INTEGER NOT NULL DEFAULT 0,
  cold           INTEGER NOT NULL DEFAULT 0,
  ion            INTEGER NOT NULL DEFAULT 0,
  sail           INTEGER NOT NULL DEFAULT 0,
  hands          INTEGER NOT NULL DEFAULT 0,
  chant          INTEGER NOT NULL DEFAULT 0,
  patches        INTEGER NOT NULL DEFAULT 0,
  km_since_shift REAL    NOT NULL DEFAULT 0,
  settled_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL
);
