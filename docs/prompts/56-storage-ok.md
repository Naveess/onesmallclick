# 56 · Storage change: OK

Date: 2026-11-20

> heres your ok

OK to the storage proposal from prompt 55 (docs/plan.md, "Phase 9a status"): save each player's progress every 60 s instead of 5 s (the shared distance stays at 5 s), update rows in place instead of replacing them, flush to D1 every 5 minutes instead of 30 s, and update "last seen" at most hourly. Accepted trade-off: after a probe restart players can lose up to a minute of credits, and the leaderboards' "today" lags up to 5 minutes.
