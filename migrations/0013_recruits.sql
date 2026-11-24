-- Phase S2 (prompts 64-65): recruits. One row per device that arrived through someone's crew link
-- as a new player (first seen under 30 minutes before, no taps yet). It becomes a recruit at 50
-- credited taps or a Ping (shared/share.ts). Nothing about the person is kept beyond their device id.
--   status: 'arrived' (not played enough yet), 'recruit' (counts for the recruiter),
--           'over-cap' (a real new player past the recruiter's 10 a day: counts in /admin's K only),
--           'own' (signed in to the recruiter's account), 'existing' (signed in to an account older than the arrival)
-- recruiter_key is the crew link owner's player key ("a:<account id>" or a device id); signing in moves a guest's rows.
CREATE TABLE recruits (
  device_id     TEXT PRIMARY KEY,
  recruiter_key TEXT NOT NULL,
  moment        TEXT NOT NULL,   -- the share moment the link came from (shared/share.ts)
  channel       TEXT NOT NULL,
  arrived_at    INTEGER NOT NULL, -- epoch ms, when the invite banner loaded
  converted_at  INTEGER,          -- epoch ms (the probe's clock), when it was decided
  status        TEXT NOT NULL DEFAULT 'arrived'
);
CREATE INDEX recruits_by_recruiter ON recruits (recruiter_key, status);
CREATE INDEX recruits_by_arrival ON recruits (arrived_at);
