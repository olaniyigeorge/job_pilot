import { google } from "googleapis";
import type { TrackerColumn } from "../../config";
import type { DiscoveredJob } from "../types";

export function googleAuth() {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN } = process.env;
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REFRESH_TOKEN)
    throw new Error(
      "Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REFRESH_TOKEN to enable Google integrations",
    );
  const auth = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET);
  auth.setCredentials({ refresh_token: GOOGLE_REFRESH_TOKEN });
  return auth;
}

function columnName(index: number): string {
  let n = index + 1;
  let result = "";
  while (n > 0) {
    const remainder = (n - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    n = Math.floor((n - 1) / 26);
  }
  return result;
}

export async function syncSheet(
  spreadsheetId: string,
  sheetName: string,
  columns: TrackerColumn[],
  dataStartRow: number,
  jobs: DiscoveredJob[],
): Promise<void> {
  spreadsheetId = process.env.GOOGLE_SHEET_ID || spreadsheetId;
  const sheets = google.sheets({ version: "v4", auth: googleAuth() });
  const tab = process.env.GOOGLE_SHEET_NAME || sheetName;
  const orderedColumns = [...columns].sort((a, b) => a.index - b.index);
  const endColumn = columnName(Math.max(...orderedColumns.map((column) => column.index)));
  const idIndex = orderedColumns.findIndex((column) => column.key === "job_id");
  if (idIndex < 0)
    throw new Error("Google Sheet config needs a job_id column for safe synchronization");
  const current = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${tab}!A${dataStartRow}:${endColumn}`,
  });
  const rowById = new Map(
    (current.data.values ?? []).map((row, index) => [
      String(row[idIndex] ?? ""),
      { rowNumber: dataStartRow + index, values: row },
    ]),
  );
  const updates: Array<{ range: string; values: unknown[][] }> = [];
  const appends: unknown[][] = [];
  for (const job of jobs) {
    const values: Record<string, unknown> = {
      job_id: job.id,
      company: job.company,
      role_title: job.title,
      location_tz: job.location,
      salary_usd: job.salary,
      job_url: job.url,
      date_found: job.dateFound,
      date_applied: job.application?.dateApplied,
      status: job.status,
      cv_version: job.applicationDraft?.tailoredCvPath,
      gap_analysis_done: true,
      follow_up_date: job.application?.followUpDate,
      interview_stage: job.application?.interviewStage,
      outcome: job.application?.outcome,
      excitement: job.application?.excitement,
      fit_score: Math.max(1, Math.min(5, Math.ceil(job.fitScore / 20))),
      notes: job.application?.notes,
    };
    const existing = rowById.get(job.id);
    const row = orderedColumns.map((column) => {
      const value = values[column.key];
      if (value !== undefined && value !== "") return value;
      if (existing) return existing.values[column.index] ?? "";
      if (column.key === "notes")
        return `Source: ${job.source}; matched: ${job.matchedSkills.join(", ")}; gaps: ${job.missingSkills.join(", ")}`;
      return "";
    });
    if (existing)
      updates.push({
        range: `${tab}!A${existing.rowNumber}:${endColumn}${existing.rowNumber}`,
        values: [row],
      });
    else appends.push(row);
  }
  if (updates.length)
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId,
      requestBody: { valueInputOption: "RAW", data: updates },
    });
  if (appends.length)
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${tab}!A:${endColumn}`,
      valueInputOption: "RAW",
      insertDataOption: "INSERT_ROWS",
      requestBody: { values: appends },
    });
}

export async function sendTelegram(message: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;
  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text: message, disable_web_page_preview: true }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Telegram notification returned HTTP ${response.status}`);
}
