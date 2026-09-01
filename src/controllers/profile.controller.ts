import { Request, Response } from "express";
import { z } from "zod";
import { db } from "../../src/prisma/db";

const profileSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  headline: z.string().optional(),
  summary: z.string().optional(),
  yearsOfExperience: z.number().int().optional(),
});

export async function getProfile(req: Request, res: Response) {
  const profile = await db.orm.public.UserProfile.first();
  if (!profile) {
    return res.status(404).json({ error: "Profile not set up yet" });
  }
  res.json(profile);
}

export async function createProfile(req: Request, res: Response) {
  const parsed = profileSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const existing = await db.orm.public.UserProfile.first();
  if (existing) {
    return res.status(409).json({ error: "Profile already exists — use PATCH to update it" });
  }

  const profile = await db.orm.public.UserProfile.create(parsed.data);
  res.status(201).json(profile);
}

export async function updateProfile(req: Request, res: Response) {
  const parsed = profileSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const existing = await db.orm.public.UserProfile.first();
  if (!existing) {
    return res.status(404).json({ error: "Profile not set up yet — POST first" });
  }

  const updated = await db.orm.public.UserProfile
    .where({ id: existing.id })
    .update(parsed.data);

  res.json(updated);
}