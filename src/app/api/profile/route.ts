import { NextResponse } from "next/server";
import { z } from "zod";

import {
  ProfileConflictError,
  ProfileNotFoundError,
  createProfile,
  getProfile,
  profileInputSchema,
  profileUpdateSchema,
  updateProfile,
} from "../../../services/profile";

/**
 * Replaces the Express `profile.routes.ts` + `profile.controller.ts`.
 * Route handlers validate, call the service, and return JSON — no business logic.
 */

export const runtime = "nodejs";

function validationError(error: z.ZodError) {
  return NextResponse.json({ error: error.flatten() }, { status: 400 });
}

function serviceError(error: unknown) {
  if (error instanceof ProfileConflictError) {
    return NextResponse.json({ error: error.message }, { status: 409 });
  }
  if (error instanceof ProfileNotFoundError) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }
  throw error;
}

export async function GET() {
  try {
    const profile = await getProfile();
    if (!profile) return NextResponse.json({ error: "Profile not set up yet" }, { status: 404 });
    return NextResponse.json(profile);
  } catch (error) {
    return serviceError(error);
  }
}

export async function POST(request: Request) {
  const parsed = profileInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return validationError(parsed.error);

  try {
    return NextResponse.json(await createProfile(parsed.data), { status: 201 });
  } catch (error) {
    return serviceError(error);
  }
}

export async function PATCH(request: Request) {
  const parsed = profileUpdateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return validationError(parsed.error);

  try {
    return NextResponse.json(await updateProfile(parsed.data));
  } catch (error) {
    return serviceError(error);
  }
}
