import { randomUUID } from "node:crypto";

import type {
  JobEvent,
  JobStore,
  JobTx,
  NewJob,
} from "@/modules/jobs/application/job-store";
import type { JobRow, JobStatus } from "@/modules/jobs/domain/job";

export function createFakeJobStore(seed: JobRow[] = []) {
  const rows = new Map(seed.map((r) => [r.id, { ...r }]));
  const events: JobEvent[] = [];

  const tx: JobTx = {
    async findById(id) {
      const row = rows.get(id);
      return row ? { ...row } : null;
    },
    async insert(input: NewJob) {
      const now = new Date();
      const row: JobRow = {
        id: randomUUID(),
        reviewedBy: null,
        reviewedAt: null,
        reviewNote: null,
        createdAt: now,
        updatedAt: now,
        ...input,
      };
      rows.set(row.id, row);
      return { ...row };
    },
    async update(id, from, patch) {
      const row = rows.get(id);
      if (!row || row.status !== from) return null;
      const updated = { ...row, ...patch, updatedAt: new Date() };
      rows.set(id, updated);
      return { ...updated };
    },
    async enqueue(event) {
      events.push(event);
    },
  };

  const store: JobStore = {
    async transaction(work) {
      const before = new Map(rows);
      const beforeEvents = events.length;
      try {
        return await work(tx);
      } catch (error) {
        rows.clear();
        for (const [k, v] of before) rows.set(k, v);
        events.length = beforeEvents;
        throw error;
      }
    },
  };

  return { store, rows, events };
}

export const jobRow = (over: Partial<JobRow> = {}): JobRow => ({
  id: "job-1",
  postedBy: "poster-1",
  title: "Backend Engineer",
  company: "Acme",
  description: "Build things",
  employmentType: "FULL_TIME",
  location: "Remote",
  workMode: "REMOTE",
  experience: "2+ years",
  skills: ["node"],
  applicationUrl: "https://acme.example/apply",
  deadline: new Date("2026-12-01"),
  status: "PENDING_REVIEW" as JobStatus,
  reviewedBy: null,
  reviewedAt: null,
  reviewNote: null,
  createdAt: new Date("2026-09-01"),
  updatedAt: new Date("2026-09-01"),
  ...over,
});
