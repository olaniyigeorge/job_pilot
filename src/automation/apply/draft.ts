import { mkdir, stat, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { chromium } from "playwright";
import { loadConfig } from "../../config";
import type { DiscoveredJob } from "../types";
import { updateJob } from "../store";
import { createTailoredCv } from "../tailor/create-tailored-cv";

async function fillFirst(
  page: import("playwright").Page,
  selectors: string[],
  value: string | undefined,
): Promise<boolean> {
  if (!value) return false;
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    try {
      if (await locator.count()) {
        await locator.fill(value, { timeout: 1500 });
        return true;
      }
    } catch {
      /* try the next semantic selector */
    }
  }
  return false;
}

export async function prepareApplicationDraft(job: DiscoveredJob): Promise<DiscoveredJob> {
  if (job.status !== "shortlisted")
    throw new Error("Shortlist this job before preparing an application draft");
  const config = loadConfig();
  const tailoredCvPath = await createTailoredCv(job, config.profile);
  const name = config.profile.name.trim().split(/\s+/);
  const firstName = name[0] ?? "";
  const lastName = name.slice(1).join(" ");
  const baseDir = resolve(process.env.JOBPILOT_ARTIFACTS_DIR?.trim() || "artifacts/applications");
  const safeId = job.id.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 120);
  const screenshotPath = resolve(baseDir, `${safeId}.png`);
  const coverLetterPath = resolve(baseDir, `${safeId}-cover-letter.txt`);
  if (
    !screenshotPath.startsWith(`${baseDir}${sep}`) ||
    !coverLetterPath.startsWith(`${baseDir}${sep}`)
  )
    throw new Error("Invalid job identifier");
  await mkdir(dirname(screenshotPath), { recursive: true });

  let resumeAvailable = false;
  try {
    await stat(tailoredCvPath);
    resumeAvailable = true;
  } catch {
    /* reported in the draft checklist below */
  }
  const paragraphs = [
    `Dear Hiring Team,`,
    `I am interested in the ${job.title} role${job.company ? ` at ${job.company}` : ""}. My background is in ${config.profile.target_role.toLowerCase()} work, with ${config.profile.experience_years} years of experience.`,
    job.matchedSkills.length
      ? `The role description mentions ${job.matchedSkills.join(", ")}, which are among the skills in my profile.`
      : "I would welcome the opportunity to discuss how my experience may fit the role.",
    `${resumeAvailable ? "I have attached my resume for your review." : "I would be happy to provide my resume for your review."} Thank you for considering my application.`,
    `Regards,\n${config.profile.name}\n${config.profile.email}${config.profile.website ? `\n${config.profile.website}` : ""}`,
  ];
  await writeFile(coverLetterPath, `${paragraphs.join("\n\n")}\n`, { mode: 0o600 });

  const missing: string[] = [];
  let resumeAttached = false;
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(job.url, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await fillFirst(
      page,
      ['input[type="email"]', 'input[name*="email" i]', 'input[autocomplete="email"]'],
      config.profile.email,
    );
    const firstFilled = await fillFirst(
      page,
      [
        'input[name*="first" i]',
        'input[autocomplete="given-name"]',
        'input[placeholder*="first" i]',
      ],
      firstName,
    );
    const lastFilled = await fillFirst(
      page,
      [
        'input[name*="last" i]',
        'input[autocomplete="family-name"]',
        'input[placeholder*="last" i]',
      ],
      lastName,
    );
    if (!firstFilled && !lastFilled)
      await fillFirst(
        page,
        ['input[name="name" i]', 'input[autocomplete="name"]', 'input[placeholder="name" i]'],
        config.profile.name,
      );
    await fillFirst(
      page,
      ['input[name*="linkedin" i]', 'input[placeholder*="linkedin" i]'],
      config.profile.linkedin,
    );
    if (config.profile.website)
      await fillFirst(
        page,
        [
          'input[name*="website" i]',
          'input[name*="portfolio" i]',
          'input[placeholder*="website" i]',
        ],
        config.profile.website,
      );
    await fillFirst(
      page,
      ['input[name*="location" i]', 'input[placeholder*="location" i]'],
      config.profile.location,
    );

    const fileInput = page.locator('input[type="file"]').first();
    if (resumeAvailable) {
      try {
        if (await fileInput.count()) {
          await fileInput.setInputFiles(tailoredCvPath);
          resumeAttached = true;
        }
      } catch (error) {
        missing.push(
          `Resume attachment failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    } else missing.push("Tailored CV file is unavailable");
    if (!resumeAttached && !missing.some((item) => item.startsWith("Resume")))
      missing.push("No resume upload field found on this page");

    const required = await page
      .locator("input[required],textarea[required],select[required]")
      .evaluateAll((elements) =>
        elements.flatMap((element) => {
          const input = element as HTMLInputElement;
          if (input.type === "file" || input.value) return [];
          return [
            input.getAttribute("aria-label") ||
              input.getAttribute("name") ||
              input.getAttribute("placeholder") ||
              input.type ||
              "required field",
          ];
        }),
      );
    missing.push(...required.map((item) => `Required field: ${item}`));
    await page.screenshot({ path: screenshotPath, fullPage: true });
  } finally {
    await browser.close();
  }

  const draft = {
    screenshotPath,
    coverLetterPath,
    tailoredCvPath,
    resumeAttached,
    createdAt: new Date().toISOString(),
    missingRequiredFields: [...new Set(missing)],
  };
  const updated = await updateJob(job.id, {
    applicationDraft: draft,
    status: resumeAttached && missing.length === 0 ? "awaiting_approval" : "draft",
  });
  if (!updated) throw new Error("Job disappeared while the application draft was being prepared");
  return updated;
}
