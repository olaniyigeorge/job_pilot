import type { Board } from "../../config";
import type { DiscoveredJob } from "../types";

const API = "https://hacker-news.firebaseio.com/v0";

export async function discoverHackerNews(
  board: Board,
  limit: number,
  now = new Date(),
): Promise<DiscoveredJob[]> {
  const idsResponse = await fetch(`${API}/jobstories.json`, {
    signal: AbortSignal.timeout(15_000),
  });
  if (!idsResponse.ok) throw new Error(`Hacker News API returned HTTP ${idsResponse.status}`);
  const ids = (await idsResponse.json()) as unknown;
  if (!Array.isArray(ids)) throw new Error("Hacker News returned an invalid job story list");
  const stories: Array<{
    id: number;
    title?: string;
    text?: string;
    url?: string;
    time?: number;
    deleted?: boolean;
    dead?: boolean;
  } | null> = [];
  const candidates = ids.slice(0, Math.min(limit * 2, 100));
  for (let offset = 0; offset < candidates.length; offset += 8) {
    const batch = await Promise.all(
      candidates.slice(offset, offset + 8).map(async (id) => {
        const response = await fetch(`${API}/item/${encodeURIComponent(String(id))}.json`, {
          signal: AbortSignal.timeout(15_000),
        });
        if (!response.ok) return null;
        return response.json() as Promise<{
          id: number;
          title?: string;
          text?: string;
          url?: string;
          time?: number;
          deleted?: boolean;
          dead?: boolean;
        }>;
      }),
    );
    stories.push(...batch);
    if (
      stories.filter((story) => story && !story.deleted && !story.dead && story.title).length >=
      limit
    )
      break;
  }
  return stories
    .filter((story): story is NonNullable<typeof story> =>
      Boolean(story && !story.deleted && !story.dead && story.title),
    )
    .slice(0, limit)
    .map((story) => {
      const url = story.url || `https://news.ycombinator.com/item?id=${story.id}`;
      const text = (story.text || "")
        .replace(/<[^>]*>/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/\s+/g, " ")
        .trim();
      return {
        id: `hn-${story.id}`,
        source: board.name,
        company: "Hacker News post",
        title: story.title!,
        location: "",
        url,
        description: text,
        publishedAt: story.time ? new Date(story.time * 1000).toISOString() : undefined,
        dateFound: now.toISOString(),
        fitScore: 0,
        matchedSkills: [],
        missingSkills: [],
        excluded: false,
        status: "discovered" as const,
      };
    });
}
