-- Phase Q1b-2: opt-in notifications (Web Push). One row per browser that turned alerts on.
-- Apply with: npx wrangler d1 migrations apply onesmallclick --remote   (or --local for npm run dev)

CREATE TABLE push_subscriptions (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  endpoint     TEXT NOT NULL UNIQUE,   -- the browser's push address (from its push service); never shown to anyone
  device_id    TEXT NOT NULL,          -- the device that turned alerts on
  account_id   TEXT,                   -- the signed-in account, so deleting the account deletes this
  created_at   INTEGER NOT NULL,       -- epoch ms
  a_signal     INTEGER NOT NULL DEFAULT 1, -- "the signal is in its final hour"
  a_burn       INTEGER NOT NULL DEFAULT 1, -- "the landing burn has started"
  a_vote       INTEGER NOT NULL DEFAULT 1, -- "today's vote closes in an hour"
  sent_day     TEXT,                   -- the UTC day sent_today counts (at most 3 alerts a day)
  sent_today   INTEGER NOT NULL DEFAULT 0,
  pending_kind TEXT,                   -- the alert the browser is about to ask about (the push itself carries no text)
  test_at      INTEGER                 -- when "Send me a test alert" last ran (once an hour)
);

CREATE INDEX push_by_device ON push_subscriptions (device_id);
CREATE INDEX push_by_account ON push_subscriptions (account_id);
