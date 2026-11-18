## Implementation plan

1. Foundations and config — underway: keep the TypeScript app, validate configs, maintain dry-run behavior, and make CI reliable.
2. Discovery, matching, and tracking: implement one source first (WWR RSS is the planned starting point), then matching, exclusions, gap analysis, deduplication, persistent storage, and /api/status plus /api/applications.
3. CV tailoring: produce a reviewable tailored CV for shortlisted jobs; resolve the current Windows-only base-CV path so it works in local and CI environments.
4. Application drafts and approval: add ATS form filling that stops before submission, saves a screenshot, and queues the draft for human approval.
5. Scheduled runs and monitoring: add scheduled orchestration, then board adapters, email monitoring, optional Google Sheets sync, notifications, and deployment.