import "dotenv/config";
import { readStore } from "../src/automation/store";
import { prepareApplicationDraft } from "../src/automation/apply/draft";

const id = process.argv[2];
if (!id) throw new Error("Usage: npm run application:draft -- <job-id>");
const job = (await readStore()).jobs.find((item) => item.id === id);
if (!job) throw new Error(`Job not found: ${id}`);
const result = await prepareApplicationDraft(job);
process.stdout.write(
  `Draft prepared. Status: ${result.status}\nScreenshot: ${result.applicationDraft?.screenshotPath}\nCover letter: ${result.applicationDraft?.coverLetterPath}\n`,
);
