-- Phase 9a (prompt 54): the per-network daily cap on pings and votes (shared/caps.ts).
-- net_hash is a keyed hash of the network (an IPv4 address, or an IPv6 /64), mixed with the day,
-- so the address is never stored and a network can't be followed from one day to the next.
-- Rows older than yesterday are deleted as new ones are counted.
CREATE TABLE network_caps (
  day      INTEGER NOT NULL, -- UTC day number (ms since 1970 / 86,400,000)
  net_hash TEXT NOT NULL,
  kind     TEXT NOT NULL,    -- 'ping' or 'vote'
  count    INTEGER NOT NULL,
  PRIMARY KEY (day, net_hash, kind)
);
