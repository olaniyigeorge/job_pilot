import { NextResponse } from "next/server";
import { z } from "zod";
import { updateJob } from "../../../../automation/store";
import { requireApiToken } from "../../../../lib/api-auth";

const updateSchema = z
  .object({
    status: z
      .enum([
        "discovered",
        "shortlisted",
        "dismissed",
        "draft",
        "awaiting_approval",
        "applied",
        "interviewing",
        "rejected",
        "offer",
        "withdrawn",
      ])
      .optional(),
    application: z
      .object({
        dateApplied: z.iso.date().optional(),
        followUpDate: z.iso.date().optional(),
        interviewStage: z.string().max(120).optional(),
        outcome: z.string().max(500).optional(),
        excitement: z.number().int().min(1).max(5).optional(),
        notes: z.string().max(5000).optional(),
      })
      .partial()
      .optional(),
  })
  .strict()
  .refine(
    (body) => body.status !== undefined || body.application !== undefined,
    "Provide a status or application tracker update",
  );

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const denied = requireApiToken(request);
  if (denied) return denied;
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { id } = await context.params;
  const job = await updateJob(id, parsed.data);
  return job
    ? NextResponse.json(job)
    : NextResponse.json({ error: "Job not found" }, { status: 404 });
}
