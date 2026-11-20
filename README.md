# JobPilot

JobPilot discovers jobs, scores them against your profile, lets you review and track them, and can
prepare a tailored CV, cover letter, and prefilled browser form for a shortlisted role. It stops at
the submit button. You review and submit applications yourself.

## Setup

### Install the npm CLI

The package is being prepared for a public npm release. Once published, install it globally and
initialize a private per-user workspace:

```sh
npm install --global jobpilot-career
jobpilot init
```

Then edit the generated `~/.jobpilot/config/profile.json` and `job_boards.json`, and run
`jobpilot discover --dry-run` or `jobpilot discover --live`. The generated `.env` and local data are
stored under `~/.jobpilot`; the CLI creates a random dashboard API token and keeps that file private.
Copy `cv_base.example.json` to `cv_base.json` and add your factual CV data before preparing drafts.
The npm package is not published yet; until then, use the repository setup below.

For an install from a source checkout, run `npm install -g .` from the repository directory, then
use the same `jobpilot init` commands.

### Run from the repository

1. Install Node.js 22 or newer and run `npm ci`.
2. Copy `.env.example` to `.env`. Set `JOBPILOT_API_TOKEN` and either `DATABASE_URL` (PostgreSQL)
   or leave it blank to use the local JSON store. For PostgreSQL, run `npm run db:migrate`.
3. Edit `config/profile.json` and `config/job_boards.json` for your search. RSS, RemoteOK's public
   feed, and Hacker News jobs are wired by default. Configure company-specific Greenhouse, Lever, or
   Ashby API boards with their provider and board slug. Boards without a usable source stay disabled.
   LinkedIn remains email-only; its adapter is enabled only after Gmail read-only access is set up.
   Mercor Explore and micro1 Talent are configured as manual-only portals; no login or scraping is
   performed. For an individual public listing page, pass its URL to `--job-url`. micro1 remains
   discover-and-notify only.
4. Copy `config/cv_base.example.json` to the ignored `config/cv_base.json` and replace the sample
   with factual work history, accomplishments, and projects. The tailoring step refuses to invent
   work history when this file is missing or incomplete.

An RSS source needs `type: "rss"`, `enabled: true`, and `rss_feed`. For company ATS boards, set
`type: "api"` and provider-specific `query_params`: Greenhouse uses `{"provider":"greenhouse",
"board_token":"company-board-token"}`, Lever uses `{"provider":"lever","site":"company-slug"}`,
and Ashby uses `{"provider":"ashby","organization":"public-board-slug"}`. Configure each company
board separately. Other sources need a supported adapter before enabling them.

## Discover and review

```sh
npm run pipeline -- --dry-run  # fetch, score, and report without saving jobs
npm run pipeline -- --live     # persist jobs and run history
npm run pipeline -- --job-url=https://example.com/job # score one public job page
npm run dev                    # open http://localhost:3000
```

The dashboard uses the API token from `.env`. It shows job fit, matched and missing skills, and run
health. You can shortlist or dismiss roles, then record application status, dates, interview stage,
outcome, excitement, and notes. With `DATABASE_URL`, the API and scheduled runner share PostgreSQL.
Without it, they use files under `data/`, which is suitable only for one persistent local process.

Use `?status=shortlisted` or `?since=2026-11-01` on `/api/applications`. `/api/status` reports the
latest run and current counts. Both require `Authorization: Bearer $JOBPILOT_API_TOKEN`. `/api/health`
is an unauthenticated liveness check. The profile API uses the same bearer token.

## Prepare an application draft

Shortlist a role in the dashboard, set up the CV source above, install Chromium with
`npm run playwright:install`, then run:

```sh
npm run application:draft -- <job-id>
```

This reorders existing CV skills and accomplishments to emphasize those that match the job, writes
a role-specific `.docx`, drafts a cover letter, fills common contact fields, attaches the CV where
possible, and saves a screenshot under `artifacts/applications/`. Review missing required fields in
the dashboard and the screenshot. JobPilot does not click or automate the submit action. The draft
command runs in the CLI because browser automation should not run inside a Next.js request handler.

## Optional Google and notifications

To set up Google, configure an OAuth client with Gmail read-only and Sheets scopes. Set
`GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`, run `npm run google:auth-url`, authorize the URL, and
exchange the returned code with `npm run google:exchange -- <code>`. Store the printed refresh token
in `.env`. Then set `JOBPILOT_ENABLE_GMAIL=true` for LinkedIn job-alert email monitoring, or
`JOBPILOT_ENABLE_SHEETS=true` for tracker write-through. The sheet ID and tab come from
`config/job_boards.json`. Telegram digest notifications work when both Telegram variables are set.
With Gmail enabled, likely recruiter replies for jobs marked applied can appear as suggestions; the
monitor never changes application status automatically.

## Scheduled discovery

`.github/workflows/daily.yml` runs discovery at 08:00 Lagos time (07:00 UTC) and supports manual
dispatch. Add `DATABASE_URL` as a GitHub Actions secret so scheduled runs share the same records as
the API deployment. Add Google and Telegram secrets only for integrations you enable. Deploy the
Next.js app with the same `DATABASE_URL` and `JOBPILOT_API_TOKEN` to view those records remotely.

## Commands

The npm CLI supports `jobpilot init`, `jobpilot discover [--dry-run|--live]`, and
`jobpilot dashboard`.

| Command                                 | Purpose                                                                |
| --------------------------------------- | ---------------------------------------------------------------------- |
| `npm run config:sync`                   | Refresh committed search config copies from the OS repo and validate   |
| `npm run config:sync -- --check`        | Check for config drift without writing                                 |
| `npm run pipeline -- --dry-run`         | Discover and score without saving                                      |
| `npm run pipeline -- --live`            | Discover, score, and save jobs and run history                         |
| `npm run pipeline -- --job-url=<url>`   | Discover and score one public job posting                              |
| `npm run application:draft -- <job-id>` | Generate reviewable application materials and a filled form screenshot |
| `npm run db:migrate`                    | Create the PostgreSQL runtime tables and indexes                       |
| `npm run lint` / `typecheck` / `test`   | Project checks                                                         |

LinkedIn is never scraped or logged into. API credentials, `.env`, browser state, CV source files,
and generated application artifacts must stay out of version control.
