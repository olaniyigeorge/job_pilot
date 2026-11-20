import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Document, HeadingLevel, Packer, Paragraph, TextRun } from "docx";
import { z } from "zod";
import type { Profile } from "../../config";
import type { DiscoveredJob } from "../types";

const entry = z.object({
  company: z.string().min(1),
  role: z.string().min(1),
  dates: z.string().min(1),
  location: z.string().optional(),
  accomplishments: z.array(z.string().min(1)).min(1),
});
const project = z.object({
  name: z.string().min(1),
  url: z.url().optional(),
  description: z.string().min(1),
  technologies: z.array(z.string()).default([]),
});
const cvSchema = z
  .object({
    summary: z.string().min(40),
    experience: z.array(entry),
    projects: z.array(project).default([]),
  })
  .refine(
    (cv) => cv.experience.length + cv.projects.length > 0,
    "Add at least one real work experience entry or project.",
  )
  .refine(
    (cv) =>
      !/write a factual|employer name|job title|describe a real accomplishment|project name|describe what you built/i.test(
        JSON.stringify(cv),
      ),
    "Replace the example placeholders with your own factual details.",
  );

type CvBase = z.infer<typeof cvSchema>;
const relevance = (text: string, skills: string[]) =>
  skills.reduce((n, skill) => n + (text.toLowerCase().includes(skill.toLowerCase()) ? 1 : 0), 0);

async function loadBase(): Promise<CvBase> {
  const path = resolve(process.env.JOBPILOT_CV_BASE_PATH?.trim() || "config/cv_base.json");
  let data: unknown;
  try {
    data = JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    throw new Error(
      `Cannot read CV source ${path}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const result = cvSchema.safeParse(data);
  if (!result.success)
    throw new Error(
      `CV source needs real experience and a summary (at least 40 characters): ${result.error.issues.map((item) => item.message).join("; ")}`,
    );
  return result.data;
}

export async function createTailoredCv(job: DiscoveredJob, profile: Profile): Promise<string> {
  const base = await loadBase();
  const skills = job.matchedSkills;
  const experience = [...base.experience].sort(
    (a, b) =>
      relevance(b.accomplishments.join(" "), skills) -
      relevance(a.accomplishments.join(" "), skills),
  );
  const projects = [...base.projects].sort(
    (a, b) =>
      relevance(`${b.description} ${b.technologies.join(" ")}`, skills) -
      relevance(`${a.description} ${a.technologies.join(" ")}`, skills),
  );
  const relevantSkills = [
    ...new Set([...profile.must_have_skills, ...Object.values(profile.tech_stack).flat()]),
  ]
    .sort(
      (a, b) =>
        Number(skills.some((item) => item.toLowerCase() === b.toLowerCase())) -
        Number(skills.some((item) => item.toLowerCase() === a.toLowerCase())),
    )
    .slice(0, 18);
  const paragraphs: Paragraph[] = [
    new Paragraph({ text: profile.name, heading: HeadingLevel.TITLE }),
    new Paragraph({
      children: [
        new TextRun(
          `${profile.location}  |  ${profile.email}${profile.website ? `  |  ${profile.website}` : ""}`,
        ),
      ],
    }),
    new Paragraph({ text: job.title, heading: HeadingLevel.HEADING_2 }),
    new Paragraph({ text: base.summary }),
    new Paragraph({ text: "Skills", heading: HeadingLevel.HEADING_1 }),
    new Paragraph({ children: [new TextRun(relevantSkills.join(" · "))] }),
    new Paragraph({ text: "Experience", heading: HeadingLevel.HEADING_1 }),
  ];
  for (const role of experience) {
    paragraphs.push(
      new Paragraph({ text: `${role.role} — ${role.company}`, heading: HeadingLevel.HEADING_2 }),
    );
    paragraphs.push(
      new Paragraph({ text: `${role.dates}${role.location ? ` · ${role.location}` : ""}` }),
    );
    for (const item of role.accomplishments)
      paragraphs.push(new Paragraph({ text: item, bullet: { level: 0 } }));
  }
  if (projects.length) {
    paragraphs.push(new Paragraph({ text: "Selected Projects", heading: HeadingLevel.HEADING_1 }));
    for (const item of projects) {
      paragraphs.push(new Paragraph({ text: item.name, heading: HeadingLevel.HEADING_2 }));
      paragraphs.push(new Paragraph({ text: item.description }));
      if (item.technologies.length)
        paragraphs.push(
          new Paragraph({
            children: [
              new TextRun({ text: `Technologies: ${item.technologies.join(", ")}`, italics: true }),
            ],
          }),
        );
    }
  }
  const document = new Document({ sections: [{ properties: {}, children: paragraphs }] });
  const directory = resolve(process.env.JOBPILOT_ARTIFACTS_DIR?.trim() || "artifacts", "cvs");
  await mkdir(directory, { recursive: true });
  const filename = `${job.id.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 120)}.docx`;
  const path = resolve(directory, filename);
  await writeFile(path, await Packer.toBuffer(document), { mode: 0o600 });
  return path;
}
