import "dotenv/config";

import { ConfigError, enabledBoards, loadConfig, type Board } from "../src/config";
import { logger } from "../src/lib/logger";
import { discoverRss } from "../src/automation/discovery/rss";
import { discoverHackerNews } from "../src/automation/discovery/hackernews";
import { discoverJobUrl } from "../src/automation/discovery/url";
import { discoverApiBoard } from "../src/automation/discovery/api-boards";
import { discoverGmail, monitorReplies } from "../src/automation/discovery/gmail";
import { scoreJob } from "../src/automation/matching/score";
import { readStore, saveRun, updateJob } from "../src/automation/store";
import type { DiscoveredJob } from "../src/automation/types";
import { sendTelegram, syncSheet } from "../src/automation/integrations/google";

/**
 * Full daily run. Defaults to dry-run: it reads config, reports what it would
 * do, and writes nowhere — no DB, no Sheet, no artifacts. Pass `--live` to let
 * stages perform real work once adapters exist.
 *
 * RSS discovery is active. Other adapter types are reported as unsupported.
 */

const USAGE = `Usage: npm run pipeline -- [options]

Options:
  --dry-run            Report only; write nothing (default)
  --live               Allow stages to perform real work
  --board=<name>       Only these boards (comma-separated, case-insensitive substring)
  --job-url=<url>      Run the pipeline for a single job URL
  -h, --help           Show this message
`;

type Options = {
  dryRun: boolean;
  boards: string[] | undefined;
  jobUrl: string | undefined;
};

function parseArgs(argv: string[]): Options {
  const options: Options = { dryRun: true, boards: undefined, jobUrl: undefined };

  for (const arg of argv) {
    if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--live") options.dryRun = false;
    else if (arg === "-h" || arg === "--help") {
      process.stdout.write(USAGE);
      process.exit(0);
    } else if (arg.startsWith("--board=")) {
      options.boards = arg
        .slice("--board=".length)
        .split(",")
        .map((name) => name.trim())
        .filter(Boolean);
    } else if (arg.startsWith("--job-url=")) {
      options.jobUrl = arg.slice("--job-url=".length).trim();
    } else {
      throw new ConfigError(`Unknown argument: ${arg}\n\n${USAGE}`);
    }
  }

  return options;
}

function selectBoards(boards: Board[], wanted: string[] | undefined): Board[] {
  if (!wanted?.length) return boards;

  const selected = boards.filter((board) =>
    wanted.some((name) => board.name.toLowerCase().includes(name.toLowerCase())),
  );

  if (selected.length === 0) {
    throw new ConfigError(
      `No enabled board matched --board=${wanted.join(",")}. Enabled: ${boards
        .map((b) => b.name)
        .join(", ")}`,
    );
  }

  return selected;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const config = loadConfig();
  const selected = selectBoards(enabledBoards(config.boards), options.boards);

  const log = logger.child({
    run: "pipeline",
    dryRun: options.dryRun,
    configDir: config.dir,
  });

  log.info(
    {
      targetRole: config.profile.target_role,
      experienceYears: config.profile.experience_years,
      boards: selected.length,
      jobUrl: options.jobUrl,
    },
    "run starting",
  );

  const startedAt = new Date();
  const discovered: DiscoveredJob[] = [];
  const errors: string[] = [];
  let skipped = 0;
  for (const board of options.jobUrl ? [] : selected) {
    if (board.type === "email_monitor" && process.env.JOBPILOT_ENABLE_GMAIL !== "true") {
      skipped += 1;
      log.info({ board: board.name }, "Gmail integration is disabled — skipped");
      continue;
    }
    const apiProvider = String(board.query_params.provider ?? "").toLowerCase();
    const apiReady =
      board.type !== "api" ||
      /remoteok/i.test(board.name) ||
      ["greenhouse", "ashby", "lever"].includes(apiProvider);
    if (!apiReady) {
      skipped += 1;
      log.info({ board: board.name }, "No configured adapter for this API board — skipped");
      continue;
    }
    const adapter =
      board.type === "rss"
        ? discoverRss
        : board.type === "api"
          ? discoverApiBoard
          : board.type === "email_monitor"
            ? discoverGmail
            : /hacker\s*news|who.s hiring/i.test(board.name)
              ? discoverHackerNews
              : null;
    if (!adapter) {
      skipped += 1;
      log.info({ board: board.name, type: board.type }, "adapter not implemented — skipped");
      continue;
    }
    try {
      const remaining = config.boards.scanner.max_total_new_jobs_per_run - discovered.length;
      if (remaining <= 0) break;
      const jobs = await adapter(
        board,
        Math.min(config.boards.scanner.max_jobs_per_board_per_run, remaining),
      );
      discovered.push(...jobs.map((job) => scoreJob(job, config.profile)));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`${board.name}: ${message}`);
      log.error({ board: board.name, err: error }, "discovery failed");
    }
  }
  if (options.jobUrl) {
    try {
      discovered.push(scoreJob(await discoverJobUrl(options.jobUrl), config.profile));
    } catch (error) {
      errors.push(`Manual URL: ${error instanceof Error ? error.message : String(error)}`);
      log.error({ err: error }, "manual job URL discovery failed");
    }
  }

  const prior = await readStore();
  const known = new Set(prior.jobs.map((job) => job.id));
  const seenThisRun = new Set<string>();
  const fresh = discovered.filter((job) => {
    if (known.has(job.id) || seenThisRun.has(job.id)) return false;
    seenThisRun.add(job.id);
    return true;
  });
  const deduped = fresh;
  const matched = deduped.filter((job) => job.status === "shortlisted").length;
  const storedJobs = new Map(prior.jobs.map((job) => [job.id, job]));
  if (!options.dryRun) {
    let emailUpdates = 0;
    if (process.env.JOBPILOT_ENABLE_GMAIL === "true") {
      try {
        const signals = await monitorReplies(prior.jobs);
        for (const { job, signal } of signals) {
          const updated = await updateJob(job.id, { emailSignal: signal });
          if (updated) {
            storedJobs.set(job.id, updated);
            emailUpdates += 1;
          }
        }
      } catch (error) {
        errors.push(
          `Gmail reply monitor: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
    if (process.env.JOBPILOT_ENABLE_SHEETS === "true") {
      try {
        const { google_sheet: sheet } = config.boards;
        await syncSheet(
          sheet.spreadsheet_id,
          sheet.sheet_name,
          sheet.columns,
          sheet.data_start_row,
          [...storedJobs.values(), ...deduped],
        );
      } catch (error) {
        errors.push(`Google Sheets: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    const completedAt = new Date();
    await saveRun(
      {
        id: `${startedAt.getTime()}`,
        startedAt: startedAt.toISOString(),
        completedAt: completedAt.toISOString(),
        status: errors.length
          ? deduped.length
            ? "partial"
            : "failed"
          : skipped > 0
            ? "partial"
            : "success",
        discovered: deduped.length,
        matched,
        skipped,
        errors,
      },
      deduped,
    );
    if (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID) {
      try {
        await sendTelegram(
          `JobPilot run finished: ${deduped.length} new jobs, ${matched} shortlisted, ${emailUpdates} possible replies, ${errors.length} issues.`,
        );
      } catch (error) {
        logger.warn({ err: error }, "notification failed");
      }
    }
  }

  log.info(
    {
      discovered: deduped.length,
      matched,
      tailored: 0,
      queuedForApproval: 0,
      skipped,
      errors: errors.length,
    },
    options.dryRun ? "dry-run complete — nothing written" : "run complete",
  );
}

main().catch((err: unknown) => {
  if (err instanceof ConfigError) {
    logger.error(err.message);
    process.exit(2);
  }
  logger.error({ err }, "pipeline failed");
  process.exit(1);
});
