import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ConfigError, enabledBoards, loadConfig } from "./load-config";

const COMMITTED_CONFIG_DIR = fileURLToPath(new URL("../../config", import.meta.url));

const profileFixture = JSON.parse(
  readFileSync(join(COMMITTED_CONFIG_DIR, "profile.json"), "utf8"),
) as Record<string, unknown>;
const boardsFixture = JSON.parse(
  readFileSync(join(COMMITTED_CONFIG_DIR, "job_boards.json"), "utf8"),
) as Record<string, unknown>;

let tempDir: string | undefined;
let originalDir: string | undefined;

/** Writes a mutated pair of config files into a temp dir and points the loader at it. */
function useTempConfig(mutate: {
  profile?: (profile: Record<string, unknown>) => void;
  boards?: (boards: Record<string, unknown>) => void;
}): void {
  tempDir = mkdtempSync(join(tmpdir(), "jobpilot-config-"));

  const profile = structuredClone(profileFixture);
  const boards = structuredClone(boardsFixture);
  mutate.profile?.(profile);
  mutate.boards?.(boards);

  writeFileSync(join(tempDir, "profile.json"), JSON.stringify(profile, null, 2));
  writeFileSync(join(tempDir, "job_boards.json"), JSON.stringify(boards, null, 2));
  process.env.JOBPILOT_CONFIG_DIR = tempDir;
}

beforeEach(() => {
  originalDir = process.env.JOBPILOT_CONFIG_DIR;
});

afterEach(() => {
  if (tempDir) rmSync(tempDir, { recursive: true, force: true });
  tempDir = undefined;

  if (originalDir === undefined) delete process.env.JOBPILOT_CONFIG_DIR;
  else process.env.JOBPILOT_CONFIG_DIR = originalDir;

  // Drop the loader's memoised result so the next test re-reads from disk.
  loadConfig({ force: true });
});

describe("loadConfig", () => {
  it("loads the committed config copies without an OS repo checkout", () => {
    delete process.env.JOBPILOT_CONFIG_DIR;

    const config = loadConfig({ force: true });

    expect(config.profile.target_role).toBe("Full-Stack Software Engineer");
    expect(config.profile.experience_years).toBe(5);
    expect(config.profile.salary.min_usd).toBeLessThan(config.profile.salary.target_usd);
    expect(config.profile.salary.target_usd).toBeLessThan(config.profile.salary.max_usd);
    expect(config.profile.must_have_skills).toContain("Python");
    expect(config.profile.exclusion_keywords).toContain("trainee");
  });

  it("preserves profile keys the schema does not model yet", () => {
    delete process.env.JOBPILOT_CONFIG_DIR;

    // `website` is intentionally a plain string, not a URL, in the real file.
    const config = loadConfig({ force: true });

    expect(config.profile.website).toBe("olaniyigeorge.com");
  });

  it("exposes the 21-column tracker schema in order", () => {
    delete process.env.JOBPILOT_CONFIG_DIR;

    const { columns } = loadConfig({ force: true }).boards.google_sheet;

    expect(columns).toHaveLength(21);
    expect(columns.map((c) => c.index)).toEqual([...Array(21).keys()]);
    expect(columns.map((c) => c.key)).toContain("fit_score");
  });

  it("returns only enabled boards, with LinkedIn kept on email alerts", () => {
    delete process.env.JOBPILOT_CONFIG_DIR;

    const enabled = enabledBoards(loadConfig({ force: true }).boards);

    expect(enabled.map((b) => b.name)).not.toContain("Indeed");
    expect(enabled.map((b) => b.name)).not.toContain("Glassdoor");

    const linkedin = enabled.find((b) => b.name === "LinkedIn");
    expect(linkedin?.type).toBe("email_monitor");
    expect(linkedin?.email_filter).toBeTruthy();
  });

  it("uses Africa/Lagos 08:00, not a UTC schedule", () => {
    delete process.env.JOBPILOT_CONFIG_DIR;

    const { scanner } = loadConfig({ force: true }).boards;

    expect(scanner.schedule).toBe("0 8 * * *");
    expect(scanner.timezone).toBe("Africa/Lagos");
  });

  it("rejects a LinkedIn board that is not an email monitor", () => {
    useTempConfig({
      boards: (boards) => {
        const list = boards.boards as { name: string; type: string }[];
        const linkedin = list.find((b) => b.name === "LinkedIn");
        if (linkedin) linkedin.type = "browser";
      },
    });

    expect(() => loadConfig({ force: true })).toThrow(ConfigError);
    expect(() => loadConfig({ force: true })).toThrow(/LinkedIn must stay "email_monitor"/);
  });

  it("rejects an enabled rss board with no feed", () => {
    useTempConfig({
      boards: (boards) => {
        const list = boards.boards as { name: string; type: string; rss_feed?: string }[];
        const wwr = list.find((b) => b.type === "rss");
        if (wwr) delete wwr.rss_feed;
      },
    });

    expect(() => loadConfig({ force: true })).toThrow(/needs an rss_feed URL/);
  });

  it("rejects a salary range that is out of order", () => {
    useTempConfig({
      profile: (profile) => {
        (profile.salary as Record<string, unknown>).min_usd = 200_000;
      },
    });

    expect(() => loadConfig({ force: true })).toThrow(/min_usd <= target_usd <= max_usd/);
  });

  it("names the offending path when a required field is missing", () => {
    useTempConfig({
      profile: (profile) => {
        delete profile.target_role;
      },
    });

    expect(() => loadConfig({ force: true })).toThrow(/target_role/);
  });

  it("fails with a readable error when a config file is absent", () => {
    tempDir = mkdtempSync(join(tmpdir(), "jobpilot-empty-"));
    process.env.JOBPILOT_CONFIG_DIR = tempDir;

    expect(() => loadConfig({ force: true })).toThrow(/Cannot read config file .*profile\.json: ENOENT/);
  });

  it("fails on malformed JSON", () => {
    tempDir = mkdtempSync(join(tmpdir(), "jobpilot-badjson-"));
    writeFileSync(join(tempDir, "profile.json"), "{ not json");
    writeFileSync(join(tempDir, "job_boards.json"), JSON.stringify(boardsFixture));
    process.env.JOBPILOT_CONFIG_DIR = tempDir;

    expect(() => loadConfig({ force: true })).toThrow(/Invalid JSON/);
  });
});
