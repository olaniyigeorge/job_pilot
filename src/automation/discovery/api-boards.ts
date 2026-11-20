import { createHash } from "node:crypto";
import type { Board } from "../../config";
import type { DiscoveredJob } from "../types";

type RecordValue = Record<string, unknown>;
const string = (value: unknown) => (typeof value === "string" ? value : "");
const text = (value: unknown) =>
  string(value)
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
const idFor = (url: string) => createHash("sha256").update(url).digest("hex");
let remoteOkCache: { at: number; data: unknown } | undefined;

async function json(url: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(url, {
    ...init,
    headers: { "user-agent": "JobPilot/1.0 (+job discovery)", ...init?.headers },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} from ${new URL(url).hostname}`);
  return response.json();
}

function normalize(
  board: Board,
  item: RecordValue,
  fields: {
    id: string;
    title: string;
    company: string;
    location: string;
    url: string;
    description: string;
    published?: string;
  },
  now: Date,
): DiscoveredJob | null {
  if (!fields.title || !fields.url || !/^https?:\/\//.test(fields.url)) return null;
  return {
    id: fields.id || idFor(fields.url),
    source: board.name,
    company: fields.company || board.name,
    title: fields.title,
    location: fields.location,
    url: fields.url,
    description: text(fields.description),
    publishedAt: fields.published || undefined,
    dateFound: now.toISOString(),
    fitScore: 0,
    matchedSkills: [],
    missingSkills: [],
    excluded: false,
    status: "discovered",
  };
}

export async function discoverApiBoard(
  board: Board,
  limit: number,
  now = new Date(),
): Promise<DiscoveredJob[]> {
  const params = board.query_params as Record<string, unknown>;
  if (/remoteok/i.test(board.name)) {
    if (!remoteOkCache || Date.now() - remoteOkCache.at > 60_000)
      remoteOkCache = { at: Date.now(), data: await json("https://remoteok.com/api") };
    const data = remoteOkCache.data;
    if (!Array.isArray(data)) throw new Error("RemoteOK API returned an invalid response");
    return data
      .filter(
        (x): x is RecordValue =>
          typeof x === "object" && x !== null && !Array.isArray(x) && "position" in x,
      )
      .filter((item) => {
        const tagText = Array.isArray(item.tags) ? item.tags.join(" ").toLowerCase() : "";
        const category = string(params.category).toLowerCase();
        if (!category || category === "programming") return true;
        return (
          tagText.includes(category) ||
          text(item.position).toLowerCase().includes(category) ||
          (category === "ai" &&
            /machine learning|artificial intelligence|llm/i.test(text(item.position)))
        );
      })
      .slice(0, limit)
      .map((item) =>
        normalize(
          board,
          item,
          {
            id: `remoteok-${string(item.id)}`,
            title: string(item.position),
            company: string(item.company),
            location: string(item.location),
            url: string(item.url),
            description: string(item.description),
            published: string(item.date),
          },
          now,
        ),
      )
      .filter((job): job is DiscoveredJob => job !== null);
  }
  const provider =
    string(params.provider).toLowerCase() || (/ashby/i.test(board.name) ? "ashby" : "");
  if (provider === "greenhouse") {
    const token = string(params.board_token);
    if (!token)
      throw new Error(
        `Set query_params.board_token to the employer's Greenhouse board token for ${board.name}`,
      );
    const data = (await json(
      `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(token)}/jobs?content=true`,
    )) as { jobs?: RecordValue[] };
    return (data.jobs ?? [])
      .slice(0, limit)
      .map((item) =>
        normalize(
          board,
          item,
          {
            id: `greenhouse-${string(item.id)}`,
            title: string(item.title),
            company: string(params.company),
            location: string((item.location as RecordValue | undefined)?.name),
            url: string(item.absolute_url),
            description: string(item.content),
          },
          now,
        ),
      )
      .filter((job): job is DiscoveredJob => job !== null);
  }
  if (provider === "ashby") {
    const org = string(params.organization);
    if (!org)
      throw new Error(`Set query_params.organization to an Ashby job board name for ${board.name}`);
    const data = (await json(
      `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(org)}`,
    )) as { jobs?: RecordValue[] };
    return (data.jobs ?? [])
      .filter((item) => item.isListed !== false)
      .slice(0, limit)
      .map((item) => {
        const url = string(item.jobUrl) || string(item.applyUrl);
        return normalize(
          board,
          item,
          {
            id: `ashby-${string(item.jobId) || idFor(url)}`,
            title: string(item.title),
            company: org,
            location: string(item.location),
            url,
            description: string(item.description),
            published: string(item.publishedAt),
          },
          now,
        );
      })
      .filter((job): job is DiscoveredJob => job !== null);
  }
  if (provider === "lever") {
    const site = string(params.site);
    if (!site)
      throw new Error(`Set query_params.site to the Lever company site slug for ${board.name}`);
    const data = await json(
      `https://api.lever.co/v0/postings/${encodeURIComponent(site)}?mode=json`,
    );
    if (!Array.isArray(data)) throw new Error("Lever API returned an invalid response");
    return data
      .slice(0, limit)
      .map((item: RecordValue) =>
        normalize(
          board,
          item,
          {
            id: `lever-${string(item.id)}`,
            title: string(item.text),
            company: site,
            location: string((item.categories as RecordValue | undefined)?.location),
            url: string(item.hostedUrl),
            description: string(item.descriptionPlain) || string(item.description),
          },
          now,
        ),
      )
      .filter((job): job is DiscoveredJob => job !== null);
  }
  throw new Error(
    `No API adapter is configured for ${board.name}. Set query_params.provider to greenhouse, ashby, or lever with its required board slug.`,
  );
}
