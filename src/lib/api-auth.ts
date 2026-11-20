import { NextResponse } from "next/server";

export function requireApiToken(request: Request): NextResponse | null {
  const token = process.env.JOBPILOT_API_TOKEN?.trim();
  if (!token) return NextResponse.json({ error: "API access is not configured" }, { status: 503 });
  if (request.headers.get("authorization") !== `Bearer ${token}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}
