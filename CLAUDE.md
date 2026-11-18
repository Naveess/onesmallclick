# CLAUDE.md

Standing rules for this project. They apply to every task unless docs/brief.md or the Project notes below say otherwise.

## Stack

- Default: static HTML, CSS and vanilla JavaScript, served by **Cloudflare Workers with static assets**.
  - Config lives in `wrangler.jsonc`; everything served lives in `./public`.
  - Local dev: `npx wrangler dev`. Deploy: `npx wrangler deploy`.
- Only add D1, KV or R2 when docs/brief.md asks for it (see "Data & storage").
- No heavy frameworks, build tools or npm dependencies unless the brief says so. Reach for a small, well-known library only when writing it yourself would clearly be worse, and say why.

## Quality bar

- **Mobile-first.** Design and test at phone width first (~375px), then scale up. No horizontal scroll, tap targets at least 44px.
- **Fast.** Keep pages light: minimal JS, no render-blocking extras, compressed and correctly sized images, lazy-load anything below the fold, system or self-hosted fonts where practical.
- Semantic HTML and basic accessibility (alt text, labels, contrast, keyboard use) as standard, not as a later pass.

## Sources of truth

- **docs/brief.md**: what we're building.
- **design/**: how it looks (Claude Design export).
- Read both before any feature work.
- If they conflict, or something you need is missing or unclear, **ask me instead of guessing**.

## Way of working

1. **Explore and explain first.** Read the relevant files, then tell me your approach (what you'll change and why). Wait for my OK before writing code.
2. **Work in phases.** Keep each phase small enough to check in one sitting. Keep the phase list in docs/plan.md.
3. **After each phase:**
   - Summarise what changed and how I can check it (URLs, steps, what to look for).
   - Add one line to docs/changelog.md (date, phase, what changed).
   - Commit and push.
   - Deploy.
   - **Stop** and wait for me before starting the next phase.
4. **Save my prompts.** Save every prompt I give you to docs/prompts/ as `NN-short-name.md` (next number, zero-padded), as the first step of the task. See docs/prompts/README.md.

## Git and secrets

- Never commit secrets: `.dev.vars`, `.env`, API tokens, keys or credentials of any kind. Use `wrangler secret put` for production secrets.
- Keep large media (video, audio, large image sets, raw design files) out of git unless I say otherwise. Ask me where they should live.
- Write clear commit messages that describe the change.

## Project notes

Project-specific details go here: domain, Cloudflare account and bindings, deviations from the rules above, gotchas and decisions.

- _Nothing yet._
