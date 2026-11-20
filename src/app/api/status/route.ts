import { NextResponse } from "next/server";
import { requireApiToken } from "../../../lib/api-auth";
import { readStore } from "../../../automation/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const denied = requireApiToken(request);
  if (denied) return denied;
  const store = await readStore();
  const latest = store.runs.at(-1) ?? null;
  return NextResponse.json({
    latestRun: latest,
    totalJobs: store.jobs.length,
    byStatus: Object.fromEntries(
      [...new Set(store.jobs.map((job) => job.status))].map((status) => [
        status,
        store.jobs.filter((job) => job.status === status).length,
      ]),
    ),
    awaitingApproval: store.jobs.filter((job) => job.status === "awaiting_approval").length,
    errors: latest?.errors ?? [],
  });
}
