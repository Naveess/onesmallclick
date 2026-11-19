-- The flight view phase (prompt 32): "You've clicked" under THRUST.
-- taps = THRUST taps the server credited that day (taps over the tap cap, or in safe mode, don't count).
-- Today's count is the row for today; all time is the sum over the player's rows (the account's
-- rows when signed in: signing in already moves a device's rows onto the account, so merging adds them).
ALTER TABLE daily_km ADD COLUMN taps INTEGER NOT NULL DEFAULT 0;

-- A guest's all-time count sums its own rows; the primary key is (day, device_id), so look up by device too.
CREATE INDEX daily_km_by_device ON daily_km (device_id, day);
