# Runbook: when something goes wrong

What to do if progress is lost, a deploy breaks the game, the probe jumps, or the database is damaged. Written for Nav, to follow under pressure (phase A1c-2, prompt 131). Commands run in Git Bash from the project folder, `C:\Users\Nav\Documents\onesmallclick`.

**Always try the cheapest fix first.** In order:

1. **One player's save state:** `/admin` › Players › the player › Save states › Compare › restore.
2. **A game save state:** `/admin` › Save states › Compare › Restore the probe.
3. **Rewind the probe:** `/admin` › Save states › Emergency: rewind the probe. This is Cloudflare's point-in-time recovery, which covers everything in the probe, including players' credits.
4. **Rewind the database:** D1 Time Travel (a Wrangler command, below).
5. **The encrypted backup in Drive:** the last resort.

**Before any of 2–5, switch maintenance mode on:** `/admin` › Game › Maintenance mode. Write a reason and press "Switch on: freeze the game". Everyone sees the banner, and nothing changes while you work. The signal, the vote and any landing burn don't count down, and switching it off moves them later by however long it was on. It stays on through deploys, restarts and restores until you switch it off. Switch it off when you've checked the game looks right.

---

## Where things are

| What | Where | Kept |
|---|---|---|
| One player's save states | `/admin` › Players › the player › Save states (R2 `players/`) | 90 days |
| Everyone who played that day | Taken daily at 00:05 UTC (R2 `players/daily/`). Each player's page lists it. | 90 days |
| A leg's crew, as it arrived | R2 `players/arrival/` | 90 days |
| Game save states | `/admin` › Save states (R2 `game/`). Taken hourly, daily, before every Game-tab control and on every new deploy. | Hourly: 7 days. The rest: 90 days |
| The probe's own history | Cloudflare point-in-time recovery, any minute | 30 days |
| The database's own history | D1 Time Travel, any minute | 7 days (30 on Workers Paid) |
| Encrypted database backups | `../onesmallclick-backups/` and Drive › OneSmallClick › Backups (encrypted) | 90 days |
| What every admin did | `/admin` › Players › a player's history, or the `admin_log` table | 1 year |

**What lives where:** the **probe** (the Durable Object) holds the shared game and everyone's progress: credits, upgrades and patches. The **database** (D1) holds accounts, devices, km per day, pings, votes, badges, legs, crew lists and the mission log.

---

## 1. "I lost my progress" (one player)

1. `/admin` › Players: search their name, email or crew code.
2. Look at their history first. A merge, a move or a fix there may explain it, and each one has an Undo.
3. Open **Save states**. Choose the last one before the problem and press **Compare**. It shows each part that's different (credits, upgrades, patches, that day's km, badges, crew credit).
4. Tick only the parts to put back, write a reason, type their name, then press **Restore**. A save state of how they are now is taken first, so it can be undone from their history.
5. Their open screens reload on their own.

**If they played as a guest and then signed in on another device:** their progress may be on the guest. Search for the guest by device, then use **Merge into an account**.

## 2. Many players lost progress, or a deploy broke saving

1. **Maintenance on.**
2. **If a deploy caused it, roll the code back:**
   ```
   npx wrangler deployments list
   npx wrangler rollback <the version before> --message "rollback: <why>"
   ```
   The probe picks up the old code within about 5 minutes. Migrations stay applied, and older code ignores new columns. Don't roll back across a migration that renamed or dropped something; none has so far.
3. **Find who's affected.** A player with no save state in the last day probably wasn't hit.
4. **Restore each player** from the daily save state (00:05 UTC) or the one before the problem, as in 1. For a few players do it by hand. For hundreds, ask Claude to script a restore from that day's `players/daily/` file; the routes are already there.
5. **Maintenance off.** Post on Discord what happened.

## 3. The probe jumped, or the game is wrong

For example, the distance is far off, the leg is wrong, the vote is stuck, or the signal is wrong.

1. **Maintenance on.**
2. `/admin` › **Save states**. Under "Daily and before changes" (or **Hourly**), choose the last good one and press **Compare**. It shows the distance, leg, signal, vote, burn, milestones and clock against now.
3. Type a reason and `RESTORE THE PROBE`, then press **Restore the probe**. A save state of now is taken first. The probe restarts on the restored game and every screen reconnects within a few seconds. Players' progress, badges and km don't change.
4. Check the Game tab, then **maintenance off**.
5. **To undo:** Save states › Restores › "Undo (compare first)".

**If the restore goes back to before a leg arrived** (the compare view warns in red), the database still says that leg arrived, so `/map` and the credits show it:
- Usually leave it. When the probe arrives again it rewrites that leg's record and crew list.
- If the next leg had already started, remove it from the database so the map doesn't show two legs. Use the leg number from Compare's "then" side, `<id>`:
  ```
  npx wrangler d1 execute onesmallclick --remote --command "DELETE FROM mission_crew WHERE mission_id > <id>; DELETE FROM missions WHERE id > <id>"
  ```
- The crew keep the arrival rewards they were paid, and get them again when it re-arrives. If that matters, restore the crew's credits from the arrival file. It's rare enough to leave for now.

## 4. Nothing in the save states fixes it: rewind the probe

Use this when the probe's storage itself is damaged, or the problem covers both the game and players' progress at once.

1. **Maintenance on.**
2. `/admin` › **Save states** › **Emergency: rewind the probe**. Enter how many minutes ago (up to 30 days), a reason and `REWIND THE PROBE`. Everything in the probe goes back to that minute, **including every player's credits, upgrades and patches**. A game save state is taken first. Maintenance stays on afterwards: it switches itself back on.
3. **Rewind the database to the same minute** (5 below). Otherwise today's km and pings won't match the probe.
4. Check, then **maintenance off**.
5. **To undo:** the Rewinds list on the same card › "Undo this". That uses the bookmark Cloudflare gave when it rewound.

This only works on Cloudflare, not in local dev.

## 5. The database is damaged: D1 Time Travel

D1 can go back to any minute in the last 7 days (30 on Workers Paid). It covers the whole database: accounts, km, pings, votes, badges, legs and the log.

1. **Maintenance on.**
2. Back up how it is now, just in case: `npm run backup -- before-time-travel`.
3. See what's there at that minute (UTC, or a Unix time in seconds):
   ```
   npx wrangler d1 time-travel info onesmallclick --timestamp=2026-12-20T14:05:00Z
   ```
4. Restore. The command prints a **bookmark that undoes it**; copy it somewhere:
   ```
   npx wrangler d1 time-travel restore onesmallclick --timestamp=2026-12-20T14:05:00Z
   ```
5. **To undo:** `npx wrangler d1 time-travel restore onesmallclick --bookmark=<the bookmark it printed>`.
6. Usually rewind the probe to the same minute too (4 above), so both agree.
7. Check, then **maintenance off**.

## 6. Last resort: the encrypted backup

Use this when Cloudflare's own history can't help: past 7 days for D1, or Cloudflare itself has lost data.

1. **Maintenance on.**
2. Get the newest `.sql.enc` from `../onesmallclick-backups/`, or Drive › OneSmallClick › Backups (encrypted).
3. Decrypt it. The passphrase is `BACKUP_PASSPHRASE` in `.dev.vars`, with a copy in the password manager:
   ```
   export BACKUP_PASSPHRASE='…'
   openssl enc -d -aes-256-cbc -pbkdf2 -iter 600000 -in <file>.sql.enc -out <file>.sql -pass env:BACKUP_PASSPHRASE
   ```
4. **Don't import it over the live database.** The export creates every table, so it would clash. Load it into a new database, check it, then point the Worker at it. This creates a new Cloudflare resource, so it's a decision for Nav:
   ```
   npx wrangler d1 create onesmallclick-restore
   npx wrangler d1 execute onesmallclick-restore --remote --file=<file>.sql
   ```
   Then change `database_name` and `database_id` under `d1_databases` in `wrangler.jsonc`, and run `npm run deploy`.
5. The probe's game and progress aren't in this backup. Use game save states (3), player save states, or the rewind (4) for those.
6. Delete the decrypted `.sql` when done, because it holds email addresses.

---

## Risky deploys: the checklist

For a deploy that changes how progress, the probe or the database work:

1. `git pull`, then run the local checks for what changed (`scripts/check-*.mjs`).
2. `npm run backup -- pre-<phase>`, then upload the `.enc` to Drive.
3. **Maintenance on**, with a message such as "Upgrading mission control. Back in a few minutes."
4. Run any migration first: `npx wrangler d1 migrations apply onesmallclick --remote`.
5. `npm run deploy`. The probe takes a "new version" game save state the first time it starts on the new code, which can be up to 5 minutes after the deploy.
6. Check the live site: home, a tap, `/admin` › Game and Save states.
7. **Maintenance off.**
8. If it's broken: section 2 (roll back), then section 3 if the game changed.

## Afterwards

- Write what happened and what fixed it in `docs/changelog.md`.
- If players lost anything, put it right and tell them, on Discord or in a message (A2).
- Note anything in this runbook that was wrong or missing, and fix it.
