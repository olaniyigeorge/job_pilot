import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { DiscoveredJob, JobStore, RunRecord } from "./types";
import { ensureDatabaseSchema, getPool } from "./database";

const storePath = () => resolve(process.env.JOBPILOT_DATA_DIR?.trim() || "data", "jobpilot.json");

export async function readStore(): Promise<JobStore> {
  if (process.env.DATABASE_URL) {
    await ensureDatabaseSchema();
    const db = getPool();
    const [jobs, runs] = await Promise.all([
      db.query<{ data: DiscoveredJob }>("SELECT data FROM jobpilot_jobs ORDER BY created_at DESC"),
      db.query<{ data: RunRecord }>("SELECT data FROM jobpilot_runs ORDER BY completed_at ASC"),
    ]);
    return { jobs: jobs.rows.map((row) => row.data), runs: runs.rows.map((row) => row.data) };
  }
  try {
    const parsed: unknown = JSON.parse(await readFile(storePath(), "utf8"));
    if (typeof parsed === "object" && parsed !== null && "jobs" in parsed && "runs" in parsed) {
      return parsed as JobStore;
    }
    throw new Error("Stored JobPilot data has an invalid shape");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { jobs: [], runs: [] };
    throw error;
  }
}

export async function writeStore(store: JobStore): Promise<void> {
  if (process.env.DATABASE_URL) {
    await ensureDatabaseSchema();
    const db = getPool();
    const client = await db.connect();
    try {
      await client.query("BEGIN");
      for (const job of store.jobs)
        await client.query(
          "INSERT INTO jobpilot_jobs(id,data) VALUES($1,$2) ON CONFLICT(id) DO UPDATE SET data=EXCLUDED.data, updated_at=now()",
          [job.id, job],
        );
      for (const run of store.runs)
        await client.query(
          "INSERT INTO jobpilot_runs(id,data,completed_at) VALUES($1,$2,$3) ON CONFLICT(id) DO UPDATE SET data=EXCLUDED.data, completed_at=EXCLUDED.completed_at",
          [run.id, run, run.completedAt],
        );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
    return;
  }
  const path = storePath();
  await mkdir(dirname(path), { recursive: true });
  const temp = `${path}.${process.pid}.tmp`;
  await writeFile(temp, `${JSON.stringify(store, null, 2)}\n`, { mode: 0o600 });
  await rename(temp, path);
}

export async function saveRun(run: RunRecord, jobs: DiscoveredJob[]): Promise<void> {
  if (process.env.DATABASE_URL) {
    await ensureDatabaseSchema();
    const db = getPool();
    const client = await db.connect();
    try {
      await client.query("BEGIN");
      for (const job of jobs)
        await client.query(
          "INSERT INTO jobpilot_jobs(id,data) VALUES($1,$2) ON CONFLICT(id) DO NOTHING",
          [job.id, job],
        );
      await client.query(
        "INSERT INTO jobpilot_runs(id,data,completed_at) VALUES($1,$2,$3) ON CONFLICT(id) DO UPDATE SET data=EXCLUDED.data, completed_at=EXCLUDED.completed_at",
        [run.id, run, run.completedAt],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
    return;
  }
  const store = await readStore();
  const known = new Set(store.jobs.map((job) => job.id));
  store.jobs.push(...jobs.filter((job) => !known.has(job.id)));
  store.runs.push(run);
  store.runs = store.runs.slice(-500);
  await writeStore(store);
}

export async function updateJob(
  id: string,
  update: Partial<
    Pick<DiscoveredJob, "status" | "applicationDraft" | "application" | "emailSignal">
  >,
): Promise<DiscoveredJob | null> {
  if (process.env.DATABASE_URL) {
    await ensureDatabaseSchema();
    const result = await getPool().query<{ data: DiscoveredJob }>(
      "UPDATE jobpilot_jobs SET data=data || $2::jsonb, updated_at=now() WHERE id=$1 RETURNING data",
      [id, update],
    );
    return result.rows[0]?.data ?? null;
  }
  const store = await readStore();
  const job = store.jobs.find((item) => item.id === id);
  if (!job) return null;
  Object.assign(job, update);
  await writeStore(store);
  return job;
}
