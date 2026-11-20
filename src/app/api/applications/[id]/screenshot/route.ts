import { readFile } from "node:fs/promises";
import { NextResponse } from "next/server";
import { readStore } from "../../../../../automation/store";
import { requireApiToken } from "../../../../../lib/api-auth";

export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const denied = requireApiToken(request);
  if (denied) return denied;
  const { id } = await context.params;
  const job = (await readStore()).jobs.find((item) => item.id === id);
  if (!job?.applicationDraft)
    return NextResponse.json({ error: "No application draft exists" }, { status: 404 });
  try {
    const image = await readFile(job.applicationDraft.screenshotPath);
    return new NextResponse(new Uint8Array(image), {
      headers: { "content-type": "image/png", "cache-control": "private, no-store" },
    });
  } catch {
    return NextResponse.json({ error: "Draft screenshot is unavailable" }, { status: 404 });
  }
}
