import "dotenv/config";

import { ConfigError, enabledBoards, loadConfig, type Board } from "../src/config";
import { logger } from "../src/lib/logger";

/**
 * Full daily run. Defaults to dry-run: it reads config, reports what it would
 * do, and writes nowhere — no DB, no Sheet, no artifacts. Pass `--live` to let
 * stages perform real work once adapters exist.
 *
 * Phase 0 wires no adapters yet, so every board is reported as skipped.
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

  // Phase 1 replaces this loop with real discovery adapters, which must honour
  // `options.dryRun` before writing anything.
  for (const board of selected) {
    log.debug({ board: board.name, type: board.type }, "no adapter implemented yet — skipped");
  }

  log.info(
    {
      discovered: 0,
      matched: 0,
      tailored: 0,
      queuedForApproval: 0,
      skipped: selected.length,
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
