import type { Profile } from "../../config";
import type { DiscoveredJob } from "../types";

export function scoreJob(job: DiscoveredJob, profile: Profile): DiscoveredJob {
  const text = `${job.title} ${job.description}`.toLowerCase();
  const title = job.title.toLowerCase();
  const allSkills = [...new Set([...profile.must_have_skills, ...profile.nice_to_have_skills])];
  const matchedSkills = allSkills.filter((skill) => text.includes(skill.toLowerCase()));
  const missingSkills = profile.must_have_skills.filter(
    (skill) => !text.includes(skill.toLowerCase()),
  );
  const exclusions = profile.exclusion_keywords.some((word) => text.includes(word.toLowerCase()));
  const mustWeight = profile.must_have_skills.length ? 55 / profile.must_have_skills.length : 0;
  const niceWeight = profile.nice_to_have_skills.length
    ? 25 / profile.nice_to_have_skills.length
    : 0;
  const skillsScore =
    profile.must_have_skills.reduce(
      (n, s) => n + (text.includes(s.toLowerCase()) ? mustWeight : 0),
      0,
    ) +
    profile.nice_to_have_skills.reduce(
      (n, s) => n + (text.includes(s.toLowerCase()) ? niceWeight : 0),
      0,
    );
  const roles = [profile.target_role, ...profile.role_alt_titles].map((role) => role.toLowerCase());
  const roleWords = roles.map((role) =>
    role
      .split(/[^a-z0-9+#]+/)
      .filter(
        (word) =>
          word.length > 2 &&
          ![
            "software",
            "engineer",
            "developer",
            "senior",
            "staff",
            "principal",
            "full",
            "stack",
          ].includes(word),
      ),
  );
  const titleMatches = roles.some((role) =>
    title.replace(/[^a-z0-9]+/g, " ").includes(role.replace(/[^a-z0-9]+/g, " ").trim()),
  );
  const fullStackMatch =
    roles.some((role) => role.includes("full stack") || role.includes("full-stack")) &&
    title.includes("full") &&
    title.includes("stack");
  const roleOverlap = Math.max(
    0,
    ...roleWords
      .filter((words) => words.length)
      .map((words) => words.filter((word) => title.includes(word)).length / words.length),
  );
  const roleScore = titleMatches || fullStackMatch ? 15 : roleOverlap * 15;
  const locationText = `${job.location} ${job.description}`.toLowerCase();
  const locationMatches =
    (profile.location_preferences.remote &&
      /remote|distributed|work from anywhere/i.test(locationText)) ||
    profile.location_preferences.countries.some(
      (country) =>
        country.toLowerCase() !== "remote (global)" && locationText.includes(country.toLowerCase()),
    );
  const fitScore = Math.round(skillsScore + roleScore + (locationMatches ? 5 : 0));
  return {
    ...job,
    fitScore,
    matchedSkills,
    missingSkills,
    excluded: exclusions,
    status: exclusions ? "dismissed" : fitScore >= 50 ? "shortlisted" : "discovered",
  };
}
