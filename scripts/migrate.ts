import "dotenv/config";
import { ensureDatabaseSchema } from "../src/automation/database";
import { logger } from "../src/lib/logger";

await ensureDatabaseSchema();
logger.info("JobPilot database schema is ready");
