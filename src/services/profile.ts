import { z } from "zod";

import { db } from "../prisma/db";

/**
 * The single-user profile row, ported out of the retired Express controller so
 * both the route handler and any CLI path share one code path (PRODUCTION_PLAN §4).
 *
 * Note this is the *stored* profile row, not `career/profile.json` — the latter
 * is the job-search config and lives behind `src/config`.
 */

export const profileInputSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  headline: z.string().optional(),
  summary: z.string().optional(),
  yearsOfExperience: z.number().int().optional(),
});

export const profileUpdateSchema = profileInputSchema.partial();

export type ProfileInput = z.infer<typeof profileInputSchema>;

export class ProfileConflictError extends Error {
  constructor() {
    super("Profile already exists — use PATCH to update it");
    this.name = "ProfileConflictError";
  }
}

export class ProfileNotFoundError extends Error {
  constructor(message = "Profile not set up yet") {
    super(message);
    this.name = "ProfileNotFoundError";
  }
}

export async function getProfile() {
  return db.orm.public.UserProfile.first();
}

export async function createProfile(input: ProfileInput) {
  if (await getProfile()) throw new ProfileConflictError();
  return db.orm.public.UserProfile.create(input);
}

export async function updateProfile(input: Partial<ProfileInput>) {
  const existing = await getProfile();
  if (!existing) throw new ProfileNotFoundError("Profile not set up yet — POST first");

  return db.orm.public.UserProfile.where({ id: existing.id }).update(input);
}
