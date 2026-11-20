"use client";

import { useCallback, useEffect, useState } from "react";

type Job = {
  id: string;
  source: string;
  company: string;
  title: string;
  location: string;
  url: string;
  description: string;
  fitScore: number;
  matchedSkills: string[];
  missingSkills: string[];
  status: string;
  dateFound: string;
  applicationDraft?: {
    coverLetterPath: string;
    tailoredCvPath: string;
    resumeAttached: boolean;
    missingRequiredFields: string[];
  };
  application?: {
    dateApplied?: string;
    followUpDate?: string;
    interviewStage?: string;
    outcome?: string;
    excitement?: number;
    notes?: string;
  };
  emailSignal?: {
    messageId: string;
    subject: string;
    receivedAt?: string;
    snippet: string;
    category: string;
  };
};
type Status = {
  latestRun: null | {
    completedAt: string;
    status: string;
    discovered: number;
    matched: number;
    skipped: number;
    errors: string[];
  };
  totalJobs: number;
  byStatus: Record<string, number>;
  awaitingApproval: number;
  errors: string[];
};

export default function Dashboard() {
  const [token, setToken] = useState("");
  const [status, setStatus] = useState<Status | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState("shortlisted");
  const [copiedId, setCopiedId] = useState("");
  const [screenshots, setScreenshots] = useState<Record<string, string>>({});

  const refresh = useCallback(
    async (key = token) => {
      if (!key) return;
      setBusy(true);
      setError("");
      try {
        const headers = { Authorization: `Bearer ${key}` };
        const [s, j] = await Promise.all([
          fetch("/api/status", { headers }),
          fetch(`/api/applications${filter ? `?status=${encodeURIComponent(filter)}` : ""}`, {
            headers,
          }),
        ]);
        if (!s.ok || !j.ok)
          throw new Error((await (s.ok ? j : s).json()).error || "Could not load JobPilot data");
        setStatus(await s.json());
        setJobs(await j.json());
        sessionStorage.setItem("jobpilot_token", key);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Request failed");
      } finally {
        setBusy(false);
      }
    },
    [filter, token],
  );

  const setJobStatus = async (id: string, nextStatus: "shortlisted" | "dismissed") => {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/applications/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      if (!response.ok) throw new Error((await response.json()).error || "Could not update job");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
      setBusy(false);
    }
  };

  const copyDraftCommand = async (id: string) => {
    try {
      await navigator.clipboard.writeText(`npm run application:draft -- ${id}`);
      setCopiedId(id);
    } catch {
      setError("Clipboard access failed. Run: npm run application:draft -- " + id);
    }
  };

  useEffect(() => {
    const saved = sessionStorage.getItem("jobpilot_token") || "";
    if (saved) {
      setToken(saved);
      void refresh(saved);
    }
  }, [refresh]);
  useEffect(() => {
    let active = true;
    for (const job of jobs)
      if (job.applicationDraft && !screenshots[job.id]) {
        void fetch(`/api/applications/${encodeURIComponent(job.id)}/screenshot`, {
          headers: { Authorization: `Bearer ${token}` },
        })
          .then(async (response) => (response.ok ? URL.createObjectURL(await response.blob()) : ""))
          .then((url) => {
            if (url && active) setScreenshots((current) => ({ ...current, [job.id]: url }));
          });
      }
    return () => {
      active = false;
    };
  }, [jobs, screenshots, token]);

  return (
    <main className="shell">
      <header>
        <div>
          <p className="eyebrow">JOB SEARCH WORKSPACE</p>
          <h1>JobPilot</h1>
          <p className="sub">Find relevant roles and keep your search moving.</p>
        </div>
        <div className="connection">
          <span className={status ? "dot online" : "dot"} />
          {status ? "Connected" : "Connect with API token"}
        </div>
      </header>
      {!status && (
        <form
          className="connect"
          onSubmit={(e) => {
            e.preventDefault();
            void refresh();
          }}
        >
          <label htmlFor="token">API token</label>
          <div className="token-row">
            <input
              id="token"
              type="password"
              autoComplete="current-password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="JOBPILOT_API_TOKEN"
            />
            <button disabled={!token || busy}>Connect</button>
          </div>
          <p>
            Set this token in your server’s <code>.env</code> file.
          </p>
        </form>
      )}
      {error && <div className="error">{error}</div>}
      {status && (
        <>
          <section className="stats">
            <article>
              <span>Tracked roles</span>
              <strong>{status.totalJobs}</strong>
            </article>
            <article>
              <span>Shortlisted</span>
              <strong>{status.byStatus.shortlisted ?? 0}</strong>
            </article>
            <article>
              <span>Awaiting approval</span>
              <strong>{status.awaitingApproval}</strong>
            </article>
            <article>
              <span>Latest run</span>
              <strong className="small">
                {status.latestRun
                  ? `${status.latestRun.status} · ${new Date(status.latestRun.completedAt).toLocaleString()}`
                  : "No runs yet"}
              </strong>
            </article>
          </section>
          <section className="jobs-head">
            <div>
              <h2>Jobs</h2>
              <p>
                {status.latestRun
                  ? `${status.latestRun.discovered} new · ${status.latestRun.matched} shortlisted · ${status.latestRun.skipped} sources skipped`
                  : "Run discovery from the command line to populate your list."}
              </p>
            </div>
            <div className="actions">
              <select value={filter} onChange={(e) => setFilter(e.target.value)}>
                <option value="shortlisted">Shortlisted</option>
                <option value="discovered">Unreviewed</option>
                <option value="draft">Draft</option>
                <option value="awaiting_approval">Awaiting approval</option>
                <option value="applied">Applied</option>
                <option value="interviewing">Interviewing</option>
                <option value="offer">Offer</option>
                <option value="rejected">Rejected</option>
                <option value="withdrawn">Withdrawn</option>
                <option value="dismissed">Dismissed</option>
                <option value="">All statuses</option>
              </select>
              <button className="secondary" onClick={() => void refresh()} disabled={busy}>
                {busy ? "Refreshing…" : "Refresh"}
              </button>
            </div>
          </section>
          {status.errors.length > 0 && (
            <div className="error">Latest run issues: {status.errors.join(" · ")}</div>
          )}
          <section className="job-list">
            {jobs.length ? (
              jobs.map((job) => (
                <article className="job" key={job.id}>
                  <div className="job-top">
                    <div>
                      <span className="source">{job.source}</span>
                      <h3>
                        <a href={job.url} target="_blank" rel="noreferrer">
                          {job.title}
                        </a>
                      </h3>
                      <p className="company">
                        {job.company}
                        {job.location ? ` · ${job.location}` : ""}
                      </p>
                    </div>
                    <span className="score">{job.fitScore}% fit</span>
                  </div>
                  <p className="description">
                    {job.description.slice(0, 420)}
                    {job.description.length > 420 ? "…" : ""}
                  </p>
                  <div className="skills">
                    {job.matchedSkills.map((skill) => (
                      <span key={skill}>{skill}</span>
                    ))}
                  </div>
                  <footer>
                    Found {new Date(job.dateFound).toLocaleDateString()} · Missing:{" "}
                    {job.missingSkills.join(", ") || "none of your must-have skills"}
                  </footer>
                  {job.status === "discovered" && (
                    <div className="review-actions">
                      <button
                        onClick={() => void setJobStatus(job.id, "shortlisted")}
                        disabled={busy}
                      >
                        Shortlist
                      </button>
                      <button
                        className="secondary"
                        onClick={() => void setJobStatus(job.id, "dismissed")}
                        disabled={busy}
                      >
                        Dismiss
                      </button>
                    </div>
                  )}
                  {job.status === "shortlisted" && (
                    <div className="review-actions">
                      <button className="secondary" onClick={() => void copyDraftCommand(job.id)}>
                        {copiedId === job.id ? "Command copied" : "Prepare application draft"}
                      </button>
                    </div>
                  )}
                  {copiedId === job.id && (
                    <p className="draft-help">
                      Run <code>npm run application:draft -- {job.id}</code> in the project
                      terminal. Fill in your real roles and accomplishments in{" "}
                      <code>config/cv_base.json</code> first.
                    </p>
                  )}
                  {job.applicationDraft && (
                    <div className="draft-info">
                      Draft status: {job.status}. Resume{" "}
                      {job.applicationDraft.resumeAttached ? "attached" : "not attached"}.{" "}
                      {job.applicationDraft.missingRequiredFields.length > 0 && (
                        <span>
                          Needs your attention:{" "}
                          {job.applicationDraft.missingRequiredFields.join(" · ")}
                        </span>
                      )}
                      <p>
                        Tailored CV: <code>{job.applicationDraft.tailoredCvPath}</code>
                      </p>
                      <p>
                        Cover letter: <code>{job.applicationDraft.coverLetterPath}</code>
                      </p>
                      {screenshots[job.id] && (
                        <img
                          className="preview"
                          src={screenshots[job.id]}
                          alt={`Unsubmitted application form for ${job.title}`}
                        />
                      )}
                    </div>
                  )}
                  {job.emailSignal && (
                    <div className="draft-info">
                      Possible recruiter email · {job.emailSignal.category} ·{" "}
                      {job.emailSignal.receivedAt
                        ? new Date(job.emailSignal.receivedAt).toLocaleString()
                        : "recent"}
                      <p>
                        <strong>{job.emailSignal.subject}</strong>
                      </p>
                      <p>{job.emailSignal.snippet}</p>
                      <small>
                        Confirm the email yourself before changing the application status.
                      </small>
                    </div>
                  )}
                  <TrackingEditor
                    key={`${job.id}:${job.status}`}
                    job={job}
                    token={token}
                    onSaved={() => void refresh()}
                    onError={setError}
                  />
                </article>
              ))
            ) : (
              <div className="empty">
                No jobs match this view. Try another filter or run discovery.
              </div>
            )}
          </section>
        </>
      )}
      <p className="disclaimer">
        JobPilot prepares and organizes your search. You review every application before submitting.
      </p>
      <style>{`*{box-sizing:border-box} .shell{max-width:1080px;margin:0 auto;padding:56px 28px 40px;color:#e8ecf3;font-family:Arial,sans-serif} header{display:flex;justify-content:space-between;align-items:center;margin-bottom:38px}.eyebrow,.source{color:#91a5c5;font-size:11px;letter-spacing:.14em;font-weight:700}h1{font-size:38px;margin:7px 0}.sub,.jobs-head p,.connect p{color:#9ba9bc;margin:8px 0}.connection{font-size:13px;color:#aab6c8}.dot{display:inline-block;width:8px;height:8px;border-radius:50%;background:#d69b57;margin-right:9px}.online{background:#6fca9a}.connect,.stats article,.job,.empty{background:#111a28;border:1px solid #243247;border-radius:14px}.connect{padding:20px;margin-bottom:28px}.connect label{font-size:13px;display:block;margin-bottom:10px}.token-row{display:flex;gap:10px}.token-row input{flex:1}input,select,textarea{background:#0b1220;color:#e8ecf3;border:1px solid #33435c;border-radius:8px;padding:12px}button{background:#79a9f5;color:#081322;border:0;border-radius:8px;padding:11px 18px;font-weight:700;cursor:pointer}button:disabled{opacity:.55;cursor:default}code{color:#bdd5fa}.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:34px}.stats article{padding:18px}.stats span{display:block;color:#9ba9bc;font-size:12px;margin-bottom:12px}.stats strong{font-size:27px}.stats .small{font-size:14px}.jobs-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:15px}.jobs-head h2{margin:0 0 6px}.jobs-head p{font-size:13px}.actions{display:flex;gap:9px}.secondary{background:#26364d;color:#deebff}.job-list{display:grid;gap:12px}.job{padding:20px}.job-top{display:flex;justify-content:space-between;gap:20px}.job h3{font-size:18px;margin:8px 0 5px}.job h3 a{color:#eef4ff;text-decoration:none}.job h3 a:hover{text-decoration:underline}.company,.description{color:#aebbd0}.company{margin:0}.score{color:#a9d9b7;background:#183125;padding:7px 10px;border-radius:99px;height:fit-content;font-size:12px;white-space:nowrap}.description{line-height:1.55;font-size:14px}.skills{display:flex;gap:6px;flex-wrap:wrap}.skills span{font-size:11px;background:#1c2a3c;padding:5px 8px;border-radius:20px;color:#c4d4ea}.job footer{margin-top:14px;font-size:11px;color:#8594aa}.empty{text-align:center;padding:40px;color:#a4b2c7}.error{padding:13px;background:#381e25;color:#ffc8c4;border-radius:9px;margin:12px 0}.disclaimer{text-align:center;color:#76869d;font-size:12px;margin-top:34px}.review-actions{display:flex;gap:8px;margin-top:15px}.draft-info{margin-top:16px;padding:15px;border-radius:9px;background:#0c1421;color:#bcc9dc;font-size:13px}.draft-info p{margin:12px 0 0}.draft-help{font-size:12px;color:#aab8cc}.tracking{margin-top:16px;border-top:1px solid #253246;padding-top:14px}.tracking summary{cursor:pointer;color:#bdd5fa;font-size:13px}.tracking form{display:grid;gap:12px;margin-top:14px}.tracking label{display:grid;gap:6px;color:#aab8cc;font-size:12px}.track-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:10px}.preview{display:block;width:100%;max-height:520px;object-fit:contain;object-position:top;margin-top:15px;background:#fff;border-radius:5px}@media(max-width:700px){.shell{padding:32px 16px}.stats{grid-template-columns:repeat(2,1fr)}.jobs-head,header{align-items:flex-start;gap:12px;flex-direction:column}.job-top{gap:8px}.actions{width:100%}.actions select{flex:1}.track-grid{grid-template-columns:1fr}}`}</style>
    </main>
  );
}

const trackingStatuses = [
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
] as const;

function TrackingEditor({
  job,
  token,
  onSaved,
  onError,
}: {
  job: Job;
  token: string;
  onSaved: () => void;
  onError: (message: string) => void;
}) {
  const [status, setStatus] = useState(job.status);
  const [dateApplied, setDateApplied] = useState(job.application?.dateApplied ?? "");
  const [followUpDate, setFollowUpDate] = useState(job.application?.followUpDate ?? "");
  const [interviewStage, setInterviewStage] = useState(job.application?.interviewStage ?? "");
  const [outcome, setOutcome] = useState(job.application?.outcome ?? "");
  const [excitement, setExcitement] = useState(job.application?.excitement?.toString() ?? "");
  const [notes, setNotes] = useState(job.application?.notes ?? "");
  const [saving, setSaving] = useState(false);

  const save = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    onError("");
    const application = Object.fromEntries(
      Object.entries({
        dateApplied,
        followUpDate,
        interviewStage,
        outcome,
        excitement: excitement ? Number(excitement) : undefined,
        notes,
      }).filter(([, value]) => value !== "" && value !== undefined),
    );
    try {
      const response = await fetch(`/api/applications/${encodeURIComponent(job.id)}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ status, application }),
      });
      if (!response.ok)
        throw new Error((await response.json()).error || "Could not update tracking details");
      onSaved();
    } catch (error) {
      onError(error instanceof Error ? error.message : "Update failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <details className="tracking">
      <summary>Update application tracker</summary>
      <form onSubmit={save}>
        <label>
          Status
          <select value={status} onChange={(event) => setStatus(event.target.value)}>
            {trackingStatuses.map((item) => (
              <option key={item} value={item}>
                {item.replaceAll("_", " ")}
              </option>
            ))}
          </select>
        </label>
        <div className="track-grid">
          <label>
            Date applied
            <input
              type="date"
              value={dateApplied}
              onChange={(event) => setDateApplied(event.target.value)}
            />
          </label>
          <label>
            Follow-up date
            <input
              type="date"
              value={followUpDate}
              onChange={(event) => setFollowUpDate(event.target.value)}
            />
          </label>
          <label>
            Interview stage
            <input
              value={interviewStage}
              onChange={(event) => setInterviewStage(event.target.value)}
              placeholder="Recruiter screen, technical…"
            />
          </label>
          <label>
            Outcome
            <input
              value={outcome}
              onChange={(event) => setOutcome(event.target.value)}
              placeholder="Pending, offer, declined…"
            />
          </label>
          <label>
            Excitement (1–5)
            <select value={excitement} onChange={(event) => setExcitement(event.target.value)}>
              <option value="">Not rated</option>
              {[1, 2, 3, 4, 5].map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
        </div>
        <label>
          Notes
          <textarea
            rows={3}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            maxLength={5000}
          />
        </label>
        <button disabled={saving}>{saving ? "Saving…" : "Save tracking"}</button>
      </form>
    </details>
  );
}
