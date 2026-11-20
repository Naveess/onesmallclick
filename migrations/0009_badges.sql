-- Phase 8b (prompts 37-38): the badges each player has earned.
-- player_key is the probe's player key: "a:<account id>" when signed in, else the device id.
-- Signing in moves a device's badges onto the account; deleting the account deletes its badges.
CREATE TABLE badges (
  player_key TEXT NOT NULL,
  badge      TEXT NOT NULL,   -- shared/badges.ts BadgeId
  earned_at  INTEGER NOT NULL, -- epoch ms
  PRIMARY KEY (player_key, badge)
);

