export type DiscoveredJob = {
  id: string;
  source: string;
  company: string;
  title: string;
  location: string;
  url: string;
  description: string;
  salary?: string;
  publishedAt?: string;
  dateFound: string;
  fitScore: number;
  matchedSkills: string[];
  missingSkills: string[];
  excluded: boolean;
  status:
    | "discovered"
    | "shortlisted"
    | "dismissed"
    | "draft"
    | "awaiting_approval"
    | "applied"
    | "interviewing"
    | "rejected"
    | "offer"
    | "withdrawn";
  applicationDraft?: {
    screenshotPath: string;
    coverLetterPath: string;
    tailoredCvPath: string;
    resumeAttached: boolean;
    createdAt: string;
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
    category: "interview" | "offer" | "rejection" | "other";
    detectedAt: string;
  };
};

export type RunRecord = {
  id: string;
  startedAt: string;
  completedAt: string;
  status: "success" | "partial" | "failed";
  discovered: number;
  matched: number;
  skipped: number;
  errors: string[];
};

export type JobStore = { jobs: DiscoveredJob[]; runs: RunRecord[] };
