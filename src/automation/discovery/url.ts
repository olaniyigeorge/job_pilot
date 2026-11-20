import { createHash } from "node:crypto";
import type { DiscoveredJob } from "../types";

function plain(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function jsonLdRecords(html: string): Record<string, unknown>[] {
  const records: Record<string, unknown>[] = [];
  for (const [, raw] of html.matchAll(
    /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  )) {
    try {
      const value: unknown = JSON.parse(raw);
      const values = Array.isArray(value) ? value : [value];
      for (const item of values) {
        if (typeof item !== "object" || item === null) continue;
        const object = item as Record<string, unknown>;
        records.push(object);
        if (Array.isArray(object["@graph"]))
          records.push(
            ...object["@graph"].filter(
              (node): node is Record<string, unknown> => typeof node === "object" && node !== null,
            ),
          );
      }
    } catch {
      /* malformed structured data is ignored; metadata fallback follows */
    }
  }
  return records;
}

function nestedName(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "object" && value !== null && "name" in value)
    return String((value as { name: unknown }).name ?? "");
  return "";
}

export async function discoverJobUrl(input: string, now = new Date()): Promise<DiscoveredJob> {
  const target = new URL(input);
  if (!["https:", "http:"].includes(target.protocol))
    throw new Error("Job URL must use HTTP or HTTPS");
  const response = await fetch(target, {
    headers: { "user-agent": "JobPilot/1.0 (+job discovery)" },
    signal: AbortSignal.timeout(25_000),
  });
  if (!response.ok) throw new Error(`Job page returned HTTP ${response.status}`);
  const html = (await response.text()).slice(0, 3_000_000);
  const records = jsonLdRecords(html);
  const structured =
    records.find((item) => {
      const type = item["@type"];
      return type === "JobPosting" || (Array.isArray(type) && type.includes("JobPosting"));
    }) ?? {};
  const titleTag = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "";
  const title = String(structured.title ?? plain(titleTag) ?? "").trim();
  const metaDescription =
    html.match(
      /<meta\b[^>]*(?:name|property)=["'](?:description|og:description)["'][^>]*content=["']([^"']*)["'][^>]*>/i,
    )?.[1] ?? "";
  const description = plain(String(structured.description ?? metaDescription));
  if (!title || !description)
    throw new Error("Could not find a job title and description on that page");
  const organization = nestedName(structured.hiringOrganization);
  const locationValue = structured.jobLocation;
  const location = Array.isArray(locationValue)
    ? locationValue
        .map((item) => nestedName((item as Record<string, unknown>)?.address))
        .filter(Boolean)
        .join(", ")
    : nestedName((locationValue as Record<string, unknown> | undefined)?.address);
  const url = response.url || target.href;
  return {
    id: createHash("sha256").update(url).digest("hex"),
    source: "Manual URL",
    company: organization || target.hostname,
    title,
    location:
      String(structured.jobLocationType ?? "").toUpperCase() === "TELECOMMUTE"
        ? `Remote${location ? ` · ${location}` : ""}`
        : location,
    url,
    description,
    publishedAt: typeof structured.datePosted === "string" ? structured.datePosted : undefined,
    salary: structured.baseSalary ? plain(JSON.stringify(structured.baseSalary)) : undefined,
    dateFound: now.toISOString(),
    fitScore: 0,
    matchedSkills: [],
    missingSkills: [],
    excluded: false,
    status: "discovered",
  };
}
