import Parser from "rss-parser";
import { createHash } from "node:crypto";
import type { Board } from "../../config";
import type { DiscoveredJob } from "../types";

const parser = new Parser({
  timeout: 20_000,
  headers: { "user-agent": "JobPilot/1.0 (+job discovery)" },
});

export async function discoverRss(
  board: Board,
  limit: number,
  now = new Date(),
): Promise<DiscoveredJob[]> {
  if (!board.rss_feed) throw new Error(`RSS board ${board.name} is missing rss_feed`);
  const feed = await parser.parseURL(board.rss_feed);
  return feed.items.slice(0, limit).flatMap((item) => {
    const url = item.link || item.guid;
    if (!item.title || !url || !/^https?:\/\//i.test(url)) return [];
    const description = item.contentSnippet || item.content || item.summary || "";
    const title = item.title.trim();
    const company =
      item.creator || item.author || title.split(/\s(?:at|@|—|–|\|)\s/i).at(-1) || board.name;
    return [
      {
        id: createHash("sha256").update(url).digest("hex"),
        source: board.name,
        company,
        title,
        location: "",
        url,
        description: description
          .replace(/<[^>]*>/g, " ")
          .replace(/\s+/g, " ")
          .trim(),
        publishedAt: item.isoDate || item.pubDate || undefined,
        dateFound: now.toISOString(),
        fitScore: 0,
        matchedSkills: [],
        missingSkills: [],
        excluded: false,
        status: "discovered" as const,
      },
    ];
  });
}
