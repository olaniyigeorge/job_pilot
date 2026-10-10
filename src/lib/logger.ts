import pino from "pino";

/**
 * Values that must never reach a log line. Add here rather than remembering to
 * scrub at each call site. `storageState` and CV blobs are secrets too, so they
 * are never logged as objects — pass counts or paths instead.
 */
const REDACTED = [
  "DATABASE_URL",
  "JOBPILOT_API_TOKEN",
  "GOOGLE_CLIENT_SECRET",
  "GOOGLE_REFRESH_TOKEN",
  "TELEGRAM_BOT_TOKEN",
  "*.password",
  "*.secret",
  "*.token",
  "*.apiKey",
  "*.api_key",
  "*.refresh_token",
  "*.access_token",
  "headers.authorization",
  "headers.cookie",
];

const isTest = process.env.NODE_ENV === "test" || process.env.VITEST === "true";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === "production" ? "info" : "debug"),
  redact: { paths: REDACTED, censor: "[redacted]" },
  // Keep test output readable; pretty-print locally, plain JSON in CI/production.
  transport:
    isTest || process.env.NODE_ENV === "production"
      ? undefined
      : { target: "pino-pretty", options: { colorize: true, translateTime: "SYS:HH:MM:ss" } },
});

/** Scoped logger — `run`, `board`, `jobId` are the bindings worth carrying. */
export function childLogger(bindings: Record<string, unknown>) {
  return logger.child(bindings);
}
