import "dotenv/config";

import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

import { ConfigError, DEFAULT_CONFIG_DIR, loadConfig } from "../src/config";
import { logger } from "../src/lib/logger";

/**
 * Refreshes the committed config copies from the OS repo, which stays the
 * source of truth (PRODUCTION_PLAN §8.2). Only `career/*.json` is ever read —
 * never `~/.secrets/`, and nothing is ever written back into the OS repo.
 *
 *   npm run config:sync            # copy, then validate the result
 *   npm run config:sync -- --check # verify the copies are in sync, write nothing
 */

const SYNCED_FILES = ["profile.json", "job_boards.json"] as const;
const DEFAULT_OS_REPO = join(homedir(), "dev", "olaniyigeorge.os");

const checkOnly = process.argv.slice(2).includes("--check");
const osRepo = process.env.JOBPILOT_OS_REPO?.trim() || DEFAULT_OS_REPO;
const sourceDir = join(osRepo, "career");
const destDir = resolve(process.cwd(), DEFAULT_CONFIG_DIR);

if (!existsSync(sourceDir)) {
  throw new ConfigError(
    `OS repo config not found at ${sourceDir}. Set JOBPILOT_OS_REPO to the OS checkout.`,
  );
}

if (!checkOnly) mkdirSync(destDir, { recursive: true });

function readIfPresent(file: string): string | undefined {
  try {
    return readFileSync(file, "utf8");
  } catch {
    return undefined;
  }
}

const drifted: string[] = [];

for (const file of SYNCED_FILES) {
  const from = join(sourceDir, file);
  const to = join(destDir, file);

  if (!existsSync(from)) throw new ConfigError(`Missing ${file} in ${sourceDir}`);

  if (checkOnly) {
    const inSync = readIfPresent(from) === readIfPresent(to);
    if (inSync) {
      logger.debug({ file }, "in sync");
    } else {
      drifted.push(file);
      logger.warn({ file }, "out of sync");
    }
    continue;
  }

  copyFileSync(from, to);
  logger.info({ file, from, to }, "config copied");
}

if (drifted.length > 0) {
  throw new ConfigError(
    `Config copies are stale: ${drifted.join(", ")}. Run \`npm run config:sync\` and commit the result.`,
  );
}

// Always validate what ended up on disk, so a bad sync fails here rather than mid-run.
const config = loadConfig({ force: true });
logger.info(
  { dir: config.dir, targetRole: config.profile.target_role, boards: config.boards.boards.length },
  checkOnly ? "config copies verified" : "config synced and validated",
);
