-- Phase 7b: milestones each mission has reached. The Probe Durable Object notices them (its own
-- SQLite is the authority); this is the record. The log entry is in log_entries (kind "milestone").
CREATE TABLE milestones (
  mission_id INTEGER NOT NULL,
  n          INTEGER NOT NULL,
  km         REAL NOT NULL,
  reached_at INTEGER NOT NULL,
  PRIMARY KEY (mission_id, n)
);
