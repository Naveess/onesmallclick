-- Phase G1 (prompts 89-93): which nudge led to each new account (shared/nudges.ts NUDGE_SOURCES), for the /admin
-- Players card. Null for accounts made before G1, or straight from the sign-in page.
ALTER TABLE accounts ADD COLUMN signup_source TEXT;
