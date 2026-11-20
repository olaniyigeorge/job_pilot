import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { z } from "zod";
import { ensureDatabaseSchema, getPool } from "../automation/database";

export const profileInputSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  headline: z.string().optional(),
  summary: z.string().optional(),
  yearsOfExperience: z.number().int().optional(),
});
export const profileUpdateSchema = profileInputSchema.partial();
export type ProfileInput = z.infer<typeof profileInputSchema>;
type StoredProfile = ProfileInput & { id: number; createdAt: string; updatedAt: string };

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

const localPath = () => resolve(process.env.JOBPILOT_DATA_DIR?.trim() || "data", "profile.json");
async function readLocal(): Promise<StoredProfile | null> {
  try {
    return JSON.parse(await readFile(localPath(), "utf8")) as StoredProfile;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}
async function writeLocal(profile: StoredProfile): Promise<void> {
  const path = localPath();
  await mkdir(dirname(path), { recursive: true });
  const temp = `${path}.${process.pid}.tmp`;
  await writeFile(temp, JSON.stringify(profile, null, 2), { mode: 0o600 });
  await rename(temp, path);
}

export async function getProfile(): Promise<StoredProfile | null> {
  if (!process.env.DATABASE_URL) return readLocal();
  await ensureDatabaseSchema();
  const result = await getPool().query<{
    id: number;
    data: ProfileInput;
    created_at: Date;
    updated_at: Date;
  }>("SELECT id,data,created_at,updated_at FROM jobpilot_profiles ORDER BY id LIMIT 1");
  const row = result.rows[0];
  return row
    ? {
        ...row.data,
        id: row.id,
        createdAt: row.created_at.toISOString(),
        updatedAt: row.updated_at.toISOString(),
      }
    : null;
}

export async function createProfile(input: ProfileInput): Promise<StoredProfile> {
  if (!process.env.DATABASE_URL) {
    if (await readLocal()) throw new ProfileConflictError();
    const now = new Date().toISOString();
    const profile = { ...input, id: 1, createdAt: now, updatedAt: now };
    await writeLocal(profile);
    return profile;
  }
  await ensureDatabaseSchema();
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(704152)");
    const found = await client.query("SELECT id FROM jobpilot_profiles LIMIT 1");
    if (found.rowCount) throw new ProfileConflictError();
    const result = await client.query<{
      id: number;
      data: ProfileInput;
      created_at: Date;
      updated_at: Date;
    }>("INSERT INTO jobpilot_profiles(data) VALUES($1) RETURNING id,data,created_at,updated_at", [
      input,
    ]);
    await client.query("COMMIT");
    const row = result.rows[0];
    return {
      ...row.data,
      id: row.id,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function updateProfile(input: Partial<ProfileInput>): Promise<StoredProfile> {
  if (!process.env.DATABASE_URL) {
    const current = await readLocal();
    if (!current) throw new ProfileNotFoundError("Profile not set up yet — POST first");
    const profile = { ...current, ...input, updatedAt: new Date().toISOString() };
    await writeLocal(profile);
    return profile;
  }
  await ensureDatabaseSchema();
  const result = await getPool().query<{
    id: number;
    data: ProfileInput;
    created_at: Date;
    updated_at: Date;
  }>(
    "UPDATE jobpilot_profiles SET data=data || $1::jsonb, updated_at=now() WHERE id=(SELECT id FROM jobpilot_profiles ORDER BY id LIMIT 1) RETURNING id,data,created_at,updated_at",
    [input],
  );
  const row = result.rows[0];
  if (!row) throw new ProfileNotFoundError("Profile not set up yet — POST first");
  return {
    ...row.data,
    id: row.id,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}
