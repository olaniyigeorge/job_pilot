import { google } from "googleapis";
import type { Board } from "../../config";
import type { DiscoveredJob } from "../types";
import { googleAuth } from "../integrations/google";

function bodyText(part: { body?: { data?: string | null }; parts?: Array<unknown> }): string {
  const own = part.body?.data ? Buffer.from(part.body.data, "base64url").toString("utf8") : "";
  const nested = (part.parts ?? []).map((child) => bodyText(child as typeof part)).join(" ");
  return `${own} ${nested}`;
}

export async function discoverGmail(
  board: Board,
  limit: number,
  now = new Date(),
): Promise<DiscoveredJob[]> {
  if (process.env.JOBPILOT_ENABLE_GMAIL !== "true")
    throw new Error("Set JOBPILOT_ENABLE_GMAIL=true to enable read-only Gmail monitoring");
  if (!board.email_filter) throw new Error(`Gmail board ${board.name} needs an email_filter`);
  const gmail = google.gmail({ version: "v1", auth: googleAuth() });
  const list = await gmail.users.messages.list({
    userId: "me",
    q: board.email_filter,
    maxResults: Math.min(limit, 100),
  });
  const messages = await Promise.all(
    (list.data.messages ?? []).map((item) =>
      gmail.users.messages.get({ userId: "me", id: item.id!, format: "full" }),
    ),
  );
  return messages.flatMap(({ data }) => {
    const headers = data.payload?.headers ?? [];
    const subject =
      headers.find((header) => header.name?.toLowerCase() === "subject")?.value ?? "Job alert";
    const raw = bodyText(data.payload as Parameters<typeof bodyText>[0]);
    const text = raw
      .replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<[^>]*>/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/\s+/g, " ")
      .trim();
    const links = [...raw.matchAll(/href=["']([^"']+)["']/gi)]
      .map((match) => match[1].replace(/&amp;/g, "&"))
      .concat(
        [...raw.matchAll(/https?:\/\/[^\s<>"']+/g)].map((match) =>
          match[0].replace(/[),.;]+$/, ""),
        ),
      );
    const url = links.find(
      (link) => !/unsubscribe|preferences|google\.com\/url\?q=|linkedin\.com\/comm\//i.test(link),
    );
    if (!data.id || !url) return [];
    return [
      {
        id: `gmail-${data.id}`,
        source: board.name,
        company: board.name,
        title: subject,
        location: "",
        url,
        description: text.slice(0, 8_000),
        publishedAt: data.internalDate
          ? new Date(Number(data.internalDate)).toISOString()
          : undefined,
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

export async function monitorReplies(
  jobs: DiscoveredJob[],
  now = new Date(),
): Promise<Array<{ job: DiscoveredJob; signal: NonNullable<DiscoveredJob["emailSignal"]> }>> {
  if (process.env.JOBPILOT_ENABLE_GMAIL !== "true") return [];
  const gmail = google.gmail({ version: "v1", auth: googleAuth() });
  const active = jobs.filter(
    (job) =>
      ["applied", "interviewing"].includes(job.status) &&
      job.company &&
      !/we work remotely|remoteok|hacker news|linkedin/i.test(job.company),
  );
  const updates: Array<{ job: DiscoveredJob; signal: NonNullable<DiscoveredJob["emailSignal"]> }> =
    [];
  for (const job of active) {
    const since = job.application?.dateApplied
      ? `after:${job.application.dateApplied.replaceAll("-", "/")}`
      : "newer_than:60d";
    const query = `"${job.company.replaceAll('"', "")}" ${since} -from:me`;
    const results = await gmail.users.messages.list({ userId: "me", q: query, maxResults: 1 });
    const messageId = results.data.messages?.[0]?.id;
    if (!messageId || job.emailSignal?.messageId === messageId) continue;
    const message = await gmail.users.messages.get({ userId: "me", id: messageId, format: "full" });
    const subject =
      message.data.payload?.headers?.find((header) => header.name?.toLowerCase() === "subject")
        ?.value ?? "Recruiter email";
    const snippet = (message.data.snippet ?? "").slice(0, 1000);
    const content = `${subject} ${snippet}`.toLowerCase();
    const category = /offer|compensation package|we are pleased to offer/.test(content)
      ? "offer"
      : /interview|schedule|availability|meet with|technical screen/.test(content)
        ? "interview"
        : /not moving forward|other candidates|unable to proceed|regret to inform|not selected|rejected/.test(
              content,
            )
          ? "rejection"
          : "other";
    updates.push({
      job,
      signal: {
        messageId,
        subject,
        receivedAt: message.data.internalDate
          ? new Date(Number(message.data.internalDate)).toISOString()
          : undefined,
        snippet,
        category,
        detectedAt: now.toISOString(),
      },
    });
  }
  return updates;
}
