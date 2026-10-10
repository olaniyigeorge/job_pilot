import "dotenv/config";

import { logger } from "../src/lib/logger";

/**
 * Replaces the old `keep_alive.py`, which pinged an unrelated endpoint. This
 * targets JobPilot's own liveness route (PRODUCTION_PLAN §7 Phase 0).
 *
 * Not needed if the host never sleeps (e.g. Vercel) — PRODUCTION_PLAN §8.6.
 */

const DEFAULT_URL = "http://localhost:3000/api/health";
const TIMEOUT_MS = 30_000;

async function ping(url: string): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { accept: "application/json" },
    });
    const body = await res.text();

    if (!res.ok) {
      logger.error({ url, status: res.status, body: body.slice(0, 500) }, "keep-alive: unhealthy");
      return false;
    }

    logger.info({ url, status: res.status }, "keep-alive: ok");
    return true;
  } catch (err) {
    logger.error({ url, err }, "keep-alive: request failed");
    return false;
  } finally {
    clearTimeout(timer);
  }
}

const url = process.env.JOBPILOT_HEALTH_URL?.trim() || DEFAULT_URL;
const ok = await ping(url);

if (!ok) process.exitCode = 1;
