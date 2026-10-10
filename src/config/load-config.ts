import { readFileSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { z } from "zod";

import { jobBoardsSchema, profileSchema, type JobBoards, type Profile } from "./schema";

/**
 * Config is a committed copy of the OS repo's `career/*.json` (decision in
 * PRODUCTION_PLAN §8.2: committed copy + sync script), so CI and fresh clones
 * never need the OS checkout. `scripts/sync-config.ts` refreshes the copies;
 * `JOBPILOT_CONFIG_DIR` points the loader somewhere else when needed.
 */
export const DEFAULT_CONFIG_DIR = "config";

export class ConfigError extends Error {
  readonly issues: string[];

  constructor(message: string, issues: string[] = []) {
    super(message);
    this.name = "ConfigError";
    this.issues = issues;
  }
}

export function configDir(): string {
  const override = process.env.JOBPILOT_CONFIG_DIR?.trim();
  if (!override) return resolve(process.cwd(), DEFAULT_CONFIG_DIR);
  return isAbsolute(override) ? override : resolve(process.cwd(), override);
}

/** Minimal structural view of a zod schema, so `parse` outlives zod majors. */
type Parser<T> = {
  safeParse: (data: unknown) => { success: true; data: T } | { success: false; error: z.ZodError };
};

function readJson(file: string): unknown {
  let raw: string;
  try {
    raw = readFileSync(file, "utf8");
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code ?? "unknown error";
    throw new ConfigError(`Cannot read config file ${file}: ${code}`);
  }

  try {
    return JSON.parse(raw) as unknown;
  } catch (err) {
    throw new ConfigError(`Invalid JSON in ${file}: ${(err as Error).message}`);
  }
}

function parse<T>(parser: Parser<T>, file: string, data: unknown): T {
  const result = parser.safeParse(data);
  if (!result.success) {
    const issues = result.error.issues.map(
      (issue) => `${issue.path.join(".") || "<root>"}: ${issue.message}`,
    );
    throw new ConfigError(
      `Config validation failed for ${file}:\n${issues.map((i) => `  - ${i}`).join("\n")}`,
      issues,
    );
  }
  return result.data;
}

export type Config = {
  profile: Profile;
  boards: JobBoards;
  /** Directory the config was loaded from — useful in logs and errors. */
  dir: string;
};

let cached: Config | undefined;

/** Loads and validates both config files. Cached; pass `force` to re-read. */
export function loadConfig(opts: { force?: boolean } = {}): Config {
  if (cached && !opts.force) return cached;

  const dir = configDir();
  const profileFile = join(dir, "profile.json");
  const boardsFile = join(dir, "job_boards.json");

  const profile = parse(profileSchema, profileFile, readJson(profileFile));
  const boards = parse(jobBoardsSchema, boardsFile, readJson(boardsFile));

  cached = { profile, boards, dir };
  return cached;
}

/** Enabled boards, in declared order. Every adapter reads through this. */
export function enabledBoards(boards: JobBoards): JobBoards["boards"] {
  return boards.boards.filter((board) => board.enabled);
}
