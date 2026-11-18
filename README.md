# site-starter

My starter template for small sites (games, tools, personal and client sites): static HTML/CSS/vanilla JS on Cloudflare Workers with static assets, plus the docs structure Claude Code works from.

## What's inside

```
CLAUDE.md            standing rules for Claude Code (+ Project notes at the bottom)
wrangler.jsonc       Worker config, serves ./public
public/index.html    placeholder page
docs/brief.md        what we're building (fill this in first)
docs/plan.md         phase plan
docs/changelog.md    one line per finished phase
docs/prompts/        every prompt given to Claude Code, numbered
design/              Claude Design export goes here
```

## Starting a new project

1. **Create the repo from this template.** Either click **Use this template** on GitHub, or run:
   ```sh
   gh repo create Naveess/<project-name> --template Naveess/site-starter --private --clone
   cd <project-name>
   ```
2. **Name it.** In `wrangler.jsonc`, replace `{{project-name}}` with the project name and set `compatibility_date` to today.
3. **Write the brief.** Fill in `docs/brief.md`. Put anything you're unsure of under Open questions.
4. **Add the design.** Drop the Claude Design export into `design/`.
5. **Add project notes.** Put anything project-specific in the Project notes section at the bottom of `CLAUDE.md`.
6. **Check it runs.**
   ```sh
   npx wrangler login    # once per machine
   npx wrangler dev      # local preview at http://localhost:8787
   npx wrangler deploy   # first deploy to <project-name>.<subdomain>.workers.dev
   ```
7. **Commit and start Claude Code** in the folder. A good first prompt: "Read CLAUDE.md, docs/brief.md and design/, then propose a phase plan for docs/plan.md."

## Secrets

Local secrets go in `.dev.vars` (git-ignored). Production secrets: `npx wrangler secret put NAME`.
