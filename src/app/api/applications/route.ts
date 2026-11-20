import { NextResponse } from "next/server";
import { requireApiToken } from "../../../lib/api-auth";
import { readStore } from "../../../automation/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const denied = requireApiToken(request);
  if (denied) return denied;
  const params = new URL(request.url).searchParams;
  const status = params.get("status");
  const since = params.get("since");
  const store = await readStore();
  const jobs = store.jobs.filter(
    (job) => (!status || job.status === status) && (!since || job.dateFound >= since),
  );
  return NextResponse.json(jobs);
}
