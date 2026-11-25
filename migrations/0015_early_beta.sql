-- The Early Beta badge (prompts 82-83): every account signed in before launch (content/beta.json endsAt).
-- The Probe gives it when an account connects; this gives it now to every account that already exists, so the
-- record of who signed up during the beta includes people who don't come back before launch. Dated when they
-- signed up. The launch wipe will keep these badges and remove the rest.
INSERT OR IGNORE INTO badges (player_key, badge, earned_at)
SELECT 'a:' || id, 'early-beta', created_at FROM accounts;
