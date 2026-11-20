# JobPilot: Build Plan (TypeScript edition)

**Last updated:** 2026-11-19 · **Stack:** TypeScript end to end: Next.js dashboard/API, PostgreSQL (`pg`), Playwright CLI, Google APIs.
**Status:** Foundations and the first discovery/review/draft path are implemented. A real CV source, database URL, OAuth consent, deployment target, and a few company-specific board slugs still require configuration.

## Implementation status (2026-11-19)

- Implemented: protected dashboard/API, PostgreSQL storage with a local JSON fallback, RemoteOK public JSON, WWR RSS, Hacker News jobs, configurable Greenhouse/Lever/Ashby company APIs, skill scoring and exclusions, deduplication, run history, application tracking, Google OAuth helpers, Gmail read-only discovery, Sheets write-through, Telegram digests, a daily Actions schedule, fact-preserving CV tailoring, and browser form preparation that stops before submission.
- User setup required: `DATABASE_URL`; Google OAuth client and refresh token; optional Telegram credentials; factual `config/cv_base.json`; company-specific board slugs; and a host for the dashboard.
- Application submission remains manual. The CLI generates a tailored CV, cover letter, fills common contact fields, and captures a screenshot; it never clicks Submit.
- Architecture changed from the proposed Prisma 8 prerelease contract to PostgreSQL through `pg`. The old client was unused and failed typechecking against its locked beta adapter. The old initialization migration is retained as historical data.

JobPilot does the work (discover, match, gap-analyze, tailor CVs, draft applications, track outcomes, report status) on a schedule. The OS repo (`olaniyigeorge.os`) stays the source of truth: it pings JobPilot and pulls data, and JobPilot never writes into it. The Google Sheet is the human-facing tracker (writing to it is allowed).

## 1. What changed from the Python plan

| Before                                            | Now                                                                                                                        |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Python + FastAPI status service                   | Next.js route handlers (`/api/*`) as the API                                                                               |
| `scanner.py` / `cv_formatter.py` ported to Python | Ported to TypeScript modules                                                                                               |
| `python-docx` for CVs                             | `docx` npm package                                                                                                         |
| `feedparser` / `googleapiclient`                  | `rss-parser` / `googleapis`                                                                                                |
| `keep_alive.py`                                   | Keep it as a tiny standalone script for now, or replace with `scripts/keep-alive.ts`. The only Python left, and removable. |
| pytest                                            | Vitest (unit) + Playwright Test (fixture HTML)                                                                             |
| Postgres via `DATABASE_URL`                       | Same, accessed through `pg`; local dry-runs can use the ignored JSON store                                                 |

Retire the Express scaffold (`src/app.ts`, `src/server.ts`, `src/routes`, `src/controllers`). Next.js replaces it, and `profile.controller.ts` logic moves into a route handler or service.

## 2. Canonical context (read from the OS repo, not invented)

- **Profile** (`career/profile.json`): target Full-Stack Software Engineer, plus Backend, AI and Real-Time Systems Engineer. About 5 years of experience. Pay $36k / $72k / $120k (min/target/max USD). Remote US/CA/EU preferred, open to global relocation.
- **Must-have:** Python, FastAPI, React, TypeScript, PostgreSQL. This is a _scoring_ list, not a build stack, so scoring keeps it as-is.
- **Nice-to-have:** WebRTC, AI, LLM, RAG, AWS, Docker, Next.js, Redis, real-time/speech/audio/voice.
- **Exclude:** trainee, crm, sales, marketing, non-technical.
- **Boards** (`career/job_boards.json`): schedule `0 8 * * * Africa/Lagos`, dedup 24h, ≤50 per board, ≤100 per run.
  - Enabled: Wellfound (api), RemoteOK ×2 (browser), Ashby (api), WWR (rss), HN Who's Hiring (browser, monthly), YC Jobs (api), LinkedIn (email_monitor).
  - Disabled: Indeed, Glassdoor.
- **Tracker** (Google Sheet, id/gid via config): 21 columns: `job_id, company, role_title, tier, location_tz, salary_usd, job_url, company_website, date_found, date_applied, status, cv_version, cover_note_sent, gap_analysis_done, projects_tailored, follow_up_date, interview_stage, outcome, excitement, fit_score, notes`. PostgreSQL JSONB job records and `/api/applications` hold the application state; Sheets is optional write-through.
- **Google auth:** `scripts/google-oauth.ts` generates consent URLs and exchanges authorization codes. Gmail and Sheets require Google Cloud OAuth credentials and a refresh token in environment variables. Never read `~/.secrets/olaniyigeorge-os/`.
- **micro1:** referral-only, not a scanned board, never auto-apply. Two independent axes: platform certification (interview → certified → profile+ID complete; record ID type) vs client-project capacity (active/paused). Vendor answers stored verbatim. Mercor is a separate parallel track.

## 3. Hard constraints (non-negotiable)

- **LinkedIn:** never scrape, log in or automate. Alerts only via Gmail (read-only).
- **Submit gate:** the current implementation stops before submission. It creates review materials and a screenshot; the user submits manually. There is no automated submit endpoint or approval record yet.
- **Secrets:** never commit them, never read secret files for keys. CI uses GitHub encrypted secrets. Playwright `storageState` is a secret. **Verify `.env` is gitignored first**, since it appears in the tree.
- **micro1:** discover/notify only.
- **Timezone:** 08:00 WAT = `0 7 * * *` UTC.
- **ToS and rate limits:** human-like pacing, retries, timeouts, no mass-blasting.

## 4. Architecture

**One Next.js app, with the automation as a plain TypeScript library and the API as a thin proxy over it.**

```
src/
  app/api/
    health/route.ts          GET  liveness (keep-alive target)
    status/route.ts          GET  last run, counts by stage, awaiting approval, errors
    applications/route.ts    GET  21-column schema (supports ?status=&since=)
    approvals/route.ts       POST logged approval (Phase 3+)
  automation/
    discovery/               board adapters (rss, api, browser, email)
    matching/                scoring, exclusion, gap analysis
    tailor/                  CV + cover letter generation
    apply/                   ATS adapters (Playwright)
    playwright/              shared browser/session/screenshot helpers
    monitor/                 Gmail replies/interviews/rejections -> status
    notify/                  digest (Telegram/email)
  config/                    loaders + zod validation (profile, boards, env)
  services/                  pipeline orchestration, store access
  automation/database.ts     shared PostgreSQL schema and connection pool
  ai/                        optional LLM assist
  sources/                   shared source types/normalizers
scripts/
  discover-jobs.ts           CLI entry (existing)
  run-pipeline.ts            full daily run, honors --dry-run
  keep_alive.py -> keep-alive.ts
```

Key decisions:

- **Next.js route handlers are the API.** They contain no business logic: they validate, call `services/`, and return JSON. The same services are called by the CLI scripts that GitHub Actions runs, so both entry points share one code path.
- **Store:** PostgreSQL through `pg` (shared by Actions and the persistent Next.js host); local runs can use ignored JSON files. Dedup lives in the store, not the Sheet.
- **Google (gated add-on):** `googleapis` client with OAuth refresh token. Gmail job-alert and possible-reply monitoring plus Sheet synchronization are feature-flagged off until credentials and consent are configured.
- **Playwright runs only in the CLI path, never inside Next.js route handlers.** Serverless hosts can't run browsers reliably, and a long browser job shouldn't be tied to an HTTP request. The API reads saved results from the DB.
- **Config-driven, idempotent, dedup at every stage.** Use `zod` for config and env validation, `pino` for structured logging. Each run writes logs and artifacts (CVs, screenshots).
- **Playwright:** CLI-only. The generic draft helper fills common contact fields, attaches the tailored CV where possible, and never clicks Submit. Site-specific questions still need human review.

Runtime dependencies include `next`, `pg`, `playwright`, `zod`, `pino`, `rss-parser`, `docx`, and `googleapis`.

## 5. OS integration (endpoints the OS pulls)

- `GET /api/health`: liveness.
- `GET /api/status`: last run time, counts by stage, items awaiting approval, errors.
- `GET /api/applications`: tracked roles in the 21-column schema.

JSON, stable, versioned if the schema changes. Protect `/status` and `/applications` with a simple bearer token (`JOBPILOT_API_TOKEN`), leaving only `/health` open. The OS pulls and never reaches into the repo. If you want a `projects/job-search/job-pilot.md` stub in the OS, I'll draft the text for you to add.

## 6. Testing and dry-run discipline

- `--dry-run` path everywhere. Default mode writes nowhere.
- **Vitest** for match, dedup, exclusion and config.
- **Playwright Test** against fixture HTML for ATS adapters.
- Route handler tests for response shape.
- Nothing hits the live web until a dry-run has passed first.

## 7. Phased roadmap

### Phase 0: Foundations — implemented

**Build:**

- Next.js + TS strict, eslint/prettier, Vitest.
- Module skeleton from §4.
- Remove the Express scaffold.
- `zod` config loader for `profile.json` and `job_boards.json`.
- `.env.example` (names only).
- `.gitignore` covering secrets, `storageState`, artifacts.
- `pino` logging.
- Dry-run harness (`run-pipeline.ts --dry-run`).
- `/api/health`.
- Retarget keep-alive to `/api/health`.
- Verify `.env` isn't tracked.
- Consolidate `job-automation.yml` and `scheduled_runs.yml` into one CI workflow (install, lint, typecheck, test).

**Tests:** config loads and validates; a no-op dry-run runs end to end; CI is green.

**DoD:** CI green, no-op dry-run works, no secrets or artifacts tracked.

### Phase 1: Discover + Match + Track + Status — implemented for configured sources

**Build:**

- Profile-based skill, title, location, and exclusion scoring; URL-based ID deduplication in PostgreSQL or the local store.
- RemoteOK JSON, WWR RSS, Hacker News jobs, and configured Greenhouse/Lever/Ashby company-board APIs.
- Per-role matched and missing skill analysis.
- `/api/status` and `/api/applications`, protected with the API token.
- Sheets write-through is implemented but flag-gated.

**Tests:** unit tests for match, dedup, exclusion; fixture-based WWR parse; endpoint shape tests.

**DoD:** met for enabled and configured sources; several disabled sources still need credentials or company slugs.

### Phase 2: Tailor — implemented; factual CV source required

**Build:**

- Port `cv_formatter.py` to `tailor/` using the `docx` package.
- Tailored CV and optional cover letter per shortlisted role, saved as artifacts.
- Resolve the base-CV gap (§8).
- Optional LLM assist (`src/ai/`).

**Tests:** snapshot tests on fixtures; must-have-missing warnings surface.

**DoD:** each shortlisted role yields a reviewable tailored CV and a fit analysis.

### Phase 3: Draft application + human review (Playwright) — generic path implemented

**Build:**

- Generic public job-page form filling: fills common contact fields, attaches the tailored CV when an upload field is available, and saves a screenshot and missing-fields report.
- `storageState` per site.
- No automated submit; the applicant reviews and submits manually.
- Browser discovery boards (RemoteOK, HN Who's Hiring).

**Tests:** Playwright against fixture HTML; a dry-run must pass before any live run.

**DoD:** basic form draft and screenshot path are available. Site-specific questions, authenticated ATS sessions, and automated approval logging are not implemented.

### Phase 4: Orchestrate, deploy, monitor, notify — schedule and integration code implemented; account setup remains

**Build:**

- Daily Actions pipeline `0 7 * * *` plus `workflow_dispatch` (`job_url`, `board`, `dry_run`, `allow_submit=false`).
- Artifact upload and fail-loud notifications.
- Deploy the Next.js app (Vercel or Render/Fly) with keep-alive if the host sleeps.
- After OAuth: Gmail monitor for LinkedIn alerts and possible replies; reply matches are suggestions for human review and do not change status automatically. Sheet sync writes tracker updates.
- API boards (Wellfound, YC, Ashby) as tokens arrive.
- Daily digest.

**DoD:** an unattended daily run produces drafts awaiting approval, updates statuses and sends a digest.

**Cross-cutting:** micro1 is discover/notify only (two axes, verbatim vendor answers). No LinkedIn automation. Respect ToS and rate limits.

## 8. Remaining setup and decisions

1. **Google OAuth consent:** code exchange tooling exists. Configure Google Cloud OAuth credentials, consent, and refresh token to enable Gmail and Sheets.
2. **Config source:** **Resolved 2026-10-09 — committed copy + sync script.** `config/*.json` are committed copies of the OS repo's `career/*.json`; `npm run config:sync` (`scripts/sync-config.ts`, `--check` for drift detection) refreshes and validates them, so CI and fresh clones never need the OS checkout. `JOBPILOT_CONFIG_DIR` overrides the location, `JOBPILOT_OS_REPO` moves the source.
3. **Base CV:** fill the ignored `config/cv_base.json` with factual history. The example file is intentionally not used as a CV.
4. **Hosting:** choose a Next.js host and PostgreSQL provider, then set the same `DATABASE_URL` and API token for the host and Actions.
5. **Digest channel:** Telegram is implemented; email digest is not.
6. **keep_alive:** optional and unrelated to the scheduled Actions worker.

## 9. Value scorecard

- **Discovery:** new unique roles per run, source coverage, run success %.
- **Relevance:** top-match precision, gap-analysis usefulness.
- **Throughput:** matches → drafts → approved → submitted, posting-to-draft time.
- **Reliability:** run success %, time-to-alert, LLM cost per run.
