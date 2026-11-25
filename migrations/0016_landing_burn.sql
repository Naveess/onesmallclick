-- E4b part 2b (prompts 84-85): how each leg's landing burn went, saved at arrival. The crew's pushed km in the
-- final hour (taps double, plus connected auto-thrust), the target, whether the bar filled (the landing was
-- stuck), and how long before landing it filled. Null for legs that arrived before the landing burn existed.
ALTER TABLE missions ADD COLUMN burn_km REAL;
ALTER TABLE missions ADD COLUMN burn_target REAL;
ALTER TABLE missions ADD COLUMN burn_ok INTEGER;
ALTER TABLE missions ADD COLUMN burn_spare_ms INTEGER;
