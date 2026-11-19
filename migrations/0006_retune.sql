-- The retune (prompts 27-28): what each device's taps actually moved the shared probe each day,
-- after self-balancing (shared/balance.ts). "Your taps today got us there X sooner" is this at
-- today's pace. km and tap_km stay the device's own km in full (credits, leaderboards).
ALTER TABLE daily_km ADD COLUMN tap_moved_km REAL NOT NULL DEFAULT 0;
