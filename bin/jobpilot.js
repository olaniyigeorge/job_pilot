#!/usr/bin/env node
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import dotenv from "dotenv";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const configRoot = process.env.JOBPILOT_HOME || join(homedir(), ".jobpilot");
const configDir = join(configRoot, "config");
const dataDir = join(configRoot, "data");
const envPath = join(configRoot, ".env");
const [command = "help", ...args] = process.argv.slice(2);

function help() {
  console.log(`JobPilot — discover jobs and prepare application drafts\n\nUsage:\n  jobpilot init                    Create your private config and local data folders\n  jobpilot discover [--dry-run]    Discover and score jobs\n  jobpilot discover --live         Save discoveries to the local store\n  jobpilot discover --job-url URL  Score one public job listing\n  jobpilot dashboard               Start the local review dashboard\n  jobpilot help                    Show this help\n\nEdit ${join(configDir, "profile.json")} and ${join(configDir, "job_boards.json")} to customize your search.\n`);
}

if (command === "help" || command === "--help" || command === "-h") {
  help();
  process.exit(0);
}

if (command === "init") {
  mkdirSync(configDir, { recursive: true });
  mkdirSync(dataDir, { recursive: true });
  for (const file of ["profile.json", "job_boards.json"]) {
    const target = join(configDir, file);
    if (!existsSync(target)) copyFileSync(join(packageRoot, "config", file), target);
  }
  const cvExample = join(configDir, "cv_base.example.json");
  if (!existsSync(cvExample)) copyFileSync(join(packageRoot, "config", "cv_base.example.json"), cvExample);
  if (!existsSync(envPath)) {
    writeFileSync(envPath, [
      `JOBPILOT_API_TOKEN=${randomBytes(32).toString("hex")}`,
      "JOBPILOT_ENABLE_GMAIL=false",
      "JOBPILOT_ENABLE_SHEETS=false",
      `JOBPILOT_DATA_DIR=${dataDir}`,
      `JOBPILOT_CV_BASE_PATH=${join(configDir, "cv_base.json")}`,
      `JOBPILOT_ARTIFACTS_DIR=${join(dataDir, "artifacts")}`,
      "",
    ].join("\n"), { mode: 0o600 });
  }
  console.log(`Initialized JobPilot in ${configRoot}`);
  console.log(`Edit ${join(configDir, "profile.json")} and ${join(configDir, "job_boards.json")}.`);
  console.log(`Copy ${cvExample} to ${join(configDir, "cv_base.json")} and add your factual CV data before drafting applications.`);
  process.exit(0);
}

if (!["discover", "dashboard"].includes(command)) {
  console.error(`Unknown command: ${command}`);
  help();
  process.exit(2);
}

if (!existsSync(envPath)) {
  console.error("JobPilot is not initialized. Run `jobpilot init` first.");
  process.exit(1);
}

dotenv.config({ path: envPath });
process.env.JOBPILOT_CONFIG_DIR ||= configDir;
process.env.JOBPILOT_DATA_DIR ||= dataDir;
process.env.JOBPILOT_CV_BASE_PATH ||= join(configDir, "cv_base.json");
process.env.JOBPILOT_ARTIFACTS_DIR ||= join(dataDir, "artifacts");

const script = command === "discover" ? "scripts/run-pipeline.ts" : "node_modules/next/dist/bin/next";
const childArgs = command === "discover"
  ? ["--import", "tsx/esm", join(packageRoot, script), ...args]
  : [script, "dev", packageRoot];
const child = spawn(process.execPath, childArgs, { cwd: packageRoot, env: process.env, stdio: "inherit" });
child.on("error", (error) => { console.error(error.message); process.exitCode = 1; });
child.on("exit", (code, signal) => {
  process.exitCode = signal ? 1 : (code ?? 1);
});
