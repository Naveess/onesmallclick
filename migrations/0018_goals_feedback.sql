-- Phase Q1a (prompt 105): the daily crew goal and the "Report a bug or idea" form.

-- One row per UTC day: the target set at 00:00 UTC, the crew's km (updated when it's reached and when the day
-- ends), when it was reached, and the bonus paid at the next 00:00 UTC. The Probe keeps its own copy; this one is
-- for /admin and history. Cleared by the launch wipe.
CREATE TABLE daily_goals (
  day           TEXT PRIMARY KEY, -- YYYY-MM-DD (UTC)
  target_km     REAL NOT NULL,
  km            REAL NOT NULL DEFAULT 0,
  reached_at    INTEGER,
  paid_at       INTEGER,
  bonus_players INTEGER,
  bonus_credits INTEGER
);

-- Bug reports and ideas. No personal data: the page, screen size and browser only. When a signed-in player ticks
-- "contact me", their account id is kept (never the email itself), so /admin can look the email up and deleting
-- the account removes it. Kept until marked done, then deleted 90 days later (decision 32).
CREATE TABLE feedback (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  at         INTEGER NOT NULL,
  kind       TEXT NOT NULL,      -- bug | idea | other
  message    TEXT NOT NULL,      -- up to 1,000 characters
  page       TEXT,               -- the path it was sent from
  info       TEXT,               -- screen size, browser, app version
  account_id TEXT,               -- only when "contact me" was ticked by a signed-in player
  done_at    INTEGER
);
CREATE INDEX feedback_by_done ON feedback (done_at, at);
