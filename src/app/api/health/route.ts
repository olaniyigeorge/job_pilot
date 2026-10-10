import { NextResponse } from "next/server";

/** Liveness only — deliberately dependency-free so it cannot fail on config or DB. */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    status: "ok",
    service: "jobpilot",
    timestamp: new Date().toISOString(),
  });
}
