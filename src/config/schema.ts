import { z } from "zod";

/* -------------------------------------------------------------------------
 * Job boards — mirrors `career/job_boards.json` in the OS repo.
 * ---------------------------------------------------------------------- */

/** Adapter family. `email_monitor` reads alerts from Gmail; it never scrapes. */
export const boardTypeSchema = z.enum(["api", "browser", "rss", "email_monitor"]);

export const scannerSchema = z.object({
  /** Cron in the board-local timezone (not UTC). */
  schedule: z.string().min(1),
  timezone: z.string().min(1),
  deduplication_hours: z.number().int().positive(),
  max_jobs_per_board_per_run: z.number().int().positive(),
  max_total_new_jobs_per_run: z.number().int().positive(),
});

export const boardSchema = z.object({
  name: z.string().min(1),
  url: z.url(),
  type: boardTypeSchema,
  enabled: z.boolean(),
  /** Free-form per-board filters; shape varies by adapter. */
  query_params: z.record(z.string(), z.unknown()).default({}),
  notes: z.string().optional(),
  rss_feed: z.url().optional(),
  email_filter: z.string().optional(),
});

/** One column of the 21-column Google Sheet tracker. */
export const trackerColumnSchema = z.object({
  index: z.number().int().nonnegative(),
  key: z.string().min(1),
  label: z.string().min(1),
});

export const googleSheetSchema = z.object({
  spreadsheet_id: z.string().min(1),
  sheet_name: z.string().min(1),
  sheet_gid: z.number().int(),
  header_row: z.number().int().positive(),
  data_start_row: z.number().int().positive(),
  columns: z.array(trackerColumnSchema).min(1),
});

/**
 * Safety invariants encoded as validation, so a bad config fails at load
 * instead of inside a browser session:
 *  - LinkedIn is never scraped, so it may only ever be `email_monitor`.
 *  - An enabled board needs the input its adapter requires.
 */
export const jobBoardsSchema = z
  .object({
    scanner: scannerSchema,
    boards: z.array(boardSchema).min(1),
    google_sheet: googleSheetSchema,
  })
  .superRefine((cfg, ctx) => {
    cfg.boards.forEach((board, i) => {
      if (/linkedin/i.test(board.name) && board.type !== "email_monitor") {
        ctx.addIssue({
          code: "custom",
          path: ["boards", i, "type"],
          message: `LinkedIn must stay "email_monitor" (got "${board.type}") — scraping or logging in is never allowed`,
        });
      }
      if (!board.enabled) return;
      if (board.type === "email_monitor" && !board.email_filter) {
        ctx.addIssue({
          code: "custom",
          path: ["boards", i, "email_filter"],
          message: "an enabled email_monitor board needs an email_filter",
        });
      }
      if (board.type === "rss" && !board.rss_feed) {
        ctx.addIssue({
          code: "custom",
          path: ["boards", i, "rss_feed"],
          message: "an enabled rss board needs an rss_feed URL",
        });
      }
    });

    const keys = new Set<string>();
    cfg.google_sheet.columns.forEach((col, i) => {
      if (keys.has(col.key)) {
        ctx.addIssue({
          code: "custom",
          path: ["google_sheet", "columns", i, "key"],
          message: `duplicate tracker column key "${col.key}"`,
        });
      }
      keys.add(col.key);
    });
  });

/* -------------------------------------------------------------------------
 * Profile — mirrors `career/profile.json` in the OS repo.
 *
 * `cv_base_path` / `cv_versions_dir` / `cv_tailored_dir` point at a
 * Windows-only checkout. Producing a base CV that works on Linux/CI is still
 * open (PRODUCTION_PLAN §8.3), so they validate as plain strings for now.
 * Unknown keys are preserved rather than stripped, so the synced copy can
 * carry fields this schema hasn't modelled yet without silently losing them.
 * ---------------------------------------------------------------------- */

const stringList = z.array(z.string().min(1));

export const salarySchema = z
  .object({
    min_usd: z.number().nonnegative(),
    target_usd: z.number().nonnegative(),
    max_usd: z.number().nonnegative(),
    currency: z.string().min(1).default("USD"),
    note: z.string().optional(),
  })
  .refine((s) => s.min_usd <= s.target_usd && s.target_usd <= s.max_usd, {
    message: "salary must satisfy min_usd <= target_usd <= max_usd",
    path: ["target_usd"],
  });

/** Feeds the tracker's `tier` column. */
export const tierPreferencesSchema = z.object({
  startup: z.boolean(),
  series_a: z.boolean(),
  series_b_plus: z.boolean(),
  big_tech: z.boolean(),
  remote_first: z.boolean(),
  hybrid: z.boolean(),
  on_site: z.boolean(),
});

export const locationPreferencesSchema = z.object({
  remote: z.boolean(),
  timezones: stringList.default([]),
  countries: stringList.default([]),
  /** Free text, e.g. "Open to global relocation". */
  relocation: z.string().optional(),
});

export const profileSchema = z
  .object({
    name: z.string().min(1),
    email: z.email(),
    website: z.string().optional(),
    linkedin: z.url(),
    location: z.string().min(1),
    /** e.g. ["Remote", "Relocation"] */
    open_to: stringList.default([]),
    target_role: z.string().min(1),
    role_alt_titles: stringList.default([]),
    experience_years: z.number().nonnegative(),
    seniority: z.string().min(1),
    /** Grouped skills — languages, frontend, backend, real_time_ai, … */
    tech_stack: z.record(z.string(), stringList),
    preferred_frameworks: stringList.default([]),
    industries_of_interest: stringList.default([]),
    salary: salarySchema,
    tier_preferences: tierPreferencesSchema,
    location_preferences: locationPreferencesSchema,
    exclusion_keywords: stringList.default([]),
    must_have_skills: stringList.default([]),
    nice_to_have_skills: stringList.default([]),
    cv_base_path: z.string().min(1),
    cv_versions_dir: z.string().min(1),
    cv_tailored_dir: z.string().min(1),
  })
  .catchall(z.unknown());

export type Board = z.infer<typeof boardSchema>;
export type BoardType = z.infer<typeof boardTypeSchema>;
export type JobBoards = z.infer<typeof jobBoardsSchema>;
export type LocationPreferences = z.infer<typeof locationPreferencesSchema>;
export type Profile = z.infer<typeof profileSchema>;
export type Salary = z.infer<typeof salarySchema>;
export type ScanConfig = z.infer<typeof scannerSchema>;
export type TierPreferences = z.infer<typeof tierPreferencesSchema>;
export type TrackerColumn = z.infer<typeof trackerColumnSchema>;
