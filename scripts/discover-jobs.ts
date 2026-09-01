import "dotenv/config";
import { db } from "../src/prisma/db";

async function main() {
  console.log(`[JobPilot] Automation run started: ${new Date().toISOString()}`);

  const profile = await db.orm.public.UserProfile.first();
  if (!profile) {
    console.log("[JobPilot] No profile configured yet — skipping discovery.");
    return;
  }

  console.log(`[JobPilot] Profile found for ${profile.firstName} ${profile.lastName}.`);
  console.log("[JobPilot] Discovery pipeline not implemented yet — placeholder run complete.");
}

main()
  .catch((err) => {
    console.error("[JobPilot] Automation run failed:", err);
    process.exit(1);
  });