# JobPilot

Automation engine for a job hunt: discover → match/gap-analyze → tailor CV → draft applications →
track → monitor → notify, on a schedule.

TypeScript end to end — Next.js route handlers are the API, the automation is a plain TS library, and
Playwright handles browser work outside the HTTP process. Build plan: [`docs/PRODUCTION_PLAN.md`](docs/PRODUCTION_PLAN.md).

## Boundaries

- The OS repo (`olaniyigeorge.os`) is the source of truth. JobPilot **exposes** data for it to pull
  (`/api/health`, plus `/api/status` and `/api/applications` in Phase 1) and never writes into it.
- **LinkedIn is never scraped, logged into, or automated.** Alerts are read from Gmail, read-only.
- **Automation stops at the submit button.** A real submit needs `ALLOW_SUBMIT` *and* a logged
  approval; the default is dry-run.
- **Secrets never touch the repo.** `.env` is gitignored, CI uses encrypted secrets, and Playwright
  `storageState` counts as a secret.

## Layout

```
config/            committed copies of the OS repo's career/*.json (see npm run config:sync)
src/
  app/api/         Next.js route handlers — thin: validate, call services/, return JSON
  config/          zod loaders + schemas for profile.json and job_boards.json
  lib/             cross-cutting helpers (logging)
  services/        shared business logic, used by both route handlers and scripts
  prisma/          Prisma 8 contract + client
scripts/           CLI entry points (GitHub Actions runs these, not the HTTP process)
```

Automation modules (`src/automation/{discovery,matching,tailor,apply,playwright,monitor,notify}`,
`src/ai/`, `src/sources/`) are added by the phase that first needs them — see PRODUCTION_PLAN §4.

## Commands

| Command | Does |
|---|---|
| `npm run dev` | Next.js dev server (API only for now) |
| `npm run pipeline -- --dry-run` | Full run. **Dry-run by default**; writes nowhere |
| `npm run config:sync` | Refresh `config/` from the OS repo, then validate |
| `npm run config:sync -- --check` | Fail if the committed copies have drifted |
| `npm run keep-alive` | Ping `/api/health` |
| `npm run lint` / `typecheck` / `test` | What CI runs |

## Config

`config/profile.json` and `config/job_boards.json` are **committed copies** of the OS repo's
`career/*.json`. The OS repo stays the source of truth; `npm run config:sync` refreshes the copies
and validates them, so CI and fresh clones never need the OS checkout. Point
`JOBPILOT_CONFIG_DIR` elsewhere to override the location, or `JOBPILOT_OS_REPO` to move the sync
source.

Config validation also enforces safety invariants — a LinkedIn board that isn't `email_monitor`, or
an enabled RSS board with no feed, fails at load rather than mid-run.
