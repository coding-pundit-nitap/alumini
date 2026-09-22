// apps/web/src/modules/jobs/domain/job.ts
/**
 * The job posting/review rules, pure (FR-JOB-001…005, spec J-2…J-9). No DRAFT: create is submit (J-2).
 * REJECTED is not terminal: an edit always resubmits it (J-3, J-4). Self-review is refused here, not only
 * by RBAC (J-5): a job.approve holder can never approve or reject their own posting.
 */
export const JOB_STATES = [
  "PENDING_REVIEW",
  "PUBLISHED",
  "REJECTED",
  "EXPIRED",
  "CLOSED",
] as const;
export type JobStatus = (typeof JOB_STATES)[number];
export const TERMINAL_STATES: readonly JobStatus[] = ["EXPIRED", "CLOSED"];

export const EMPLOYMENT_TYPES = [
  "FULL_TIME",
  "PART_TIME",
  "INTERNSHIP",
  "CONTRACT",
] as const;
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];

export const WORK_MODES = ["ONSITE", "REMOTE", "HYBRID"] as const;
export type WorkMode = (typeof WORK_MODES)[number];

export type JobEventType =
  "job.submitted" | "job.published" | "job.rejected" | "job.closed";

export type JobRow = {
  id: string;
  postedBy: string;
  title: string;
  company: string;
  description: string;
  employmentType: EmploymentType;
  location: string;
  workMode: WorkMode;
  experience: string;
  skills: string[];
  applicationUrl: string;
  deadline: Date;
  status: JobStatus;
  reviewedBy: string | null;
  reviewedAt: Date | null;
  reviewNote: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type JobContent = Pick<
  JobRow,
  | "title"
  | "company"
  | "description"
  | "employmentType"
  | "location"
  | "workMode"
  | "experience"
  | "skills"
  | "applicationUrl"
  | "deadline"
>;

/** The material fields (spec J-4): changing any of these on a PUBLISHED job forces re-review. */
export const MATERIAL_FIELDS = [
  "title",
  "company",
  "description",
  "applicationUrl",
  "deadline",
] as const satisfies readonly (keyof JobContent)[];

/** Written whole, so no transition leaves a stale review field behind (ck_job_reject_note depends on it). */
export type JobPatch = Pick<
  JobRow,
  "status" | "reviewedBy" | "reviewedAt" | "reviewNote"
>;

export type Refusal = {
  code:
    | "NOT_FOUND"
    | "NOT_OWNER"
    | "INVALID_STATE_TRANSITION"
    | "SELF_REVIEW_FORBIDDEN"
    | "REVIEW_NOTE_REQUIRED";
};
type Decision<T> = ({ ok: true } & T) | ({ ok: false } & Refusal);
const refuse = (code: Refusal["code"]): { ok: false } & Refusal => ({
  ok: false,
  code,
});

const CLOSE_ELIGIBLE: readonly JobStatus[] = ["PENDING_REVIEW", "PUBLISHED"];

/** FR-JOB-001, spec J-2. Create and submit are one action; the outcome depends only on the actor's own permission. */
export function decideCreate(actorHasApprove: boolean): Decision<{
  status: JobStatus;
  directPublish: boolean;
  event: JobEventType;
}> {
  return actorHasApprove
    ? {
        ok: true,
        status: "PUBLISHED",
        directPublish: true,
        event: "job.published",
      }
    : {
        ok: true,
        status: "PENDING_REVIEW",
        directPublish: false,
        event: "job.submitted",
      };
}

/**
 * FR-JOB-002, spec J-4. `materialChanged` and `isOwnerOrManager` are resolved by the caller (the store
 * already has the row; permission is a boolean the application layer already knows), so this stays pure.
 */
export function decideEdit(
  row: JobRow,
  materialChanged: boolean,
  isOwnerOrManager: boolean
): Decision<{ patch: JobPatch; event: JobEventType | null }> {
  if (!isOwnerOrManager) return refuse("NOT_OWNER");
  if (TERMINAL_STATES.includes(row.status))
    return refuse("INVALID_STATE_TRANSITION");

  if (row.status === "REJECTED") {
    return {
      ok: true,
      patch: {
        status: "PENDING_REVIEW",
        reviewedBy: row.reviewedBy,
        reviewedAt: row.reviewedAt,
        reviewNote: null,
      },
      event: "job.submitted",
    };
  }
  if (row.status === "PUBLISHED" && materialChanged) {
    return {
      ok: true,
      patch: {
        status: "PENDING_REVIEW",
        reviewedBy: null,
        reviewedAt: null,
        reviewNote: null,
      },
      event: "job.submitted",
    };
  }
  // PENDING_REVIEW (any edit), or PUBLISHED with only non-material fields changed: status is untouched.
  return {
    ok: true,
    patch: {
      status: row.status,
      reviewedBy: row.reviewedBy,
      reviewedAt: row.reviewedAt,
      reviewNote: row.reviewNote,
    },
    event: null,
  };
}

/** FR-JOB-003, spec J-5/J-6. The DB's guarded UPDATE (WHERE status = 'PENDING_REVIEW') is the race backstop. */
export function decideApprove(
  row: JobRow,
  actorId: string,
  now: Date
): Decision<{ patch: JobPatch }> {
  if (actorId === row.postedBy) return refuse("SELF_REVIEW_FORBIDDEN");
  if (row.status !== "PENDING_REVIEW")
    return refuse("INVALID_STATE_TRANSITION");
  return {
    ok: true,
    patch: {
      status: "PUBLISHED",
      reviewedBy: actorId,
      reviewedAt: now,
      reviewNote: null,
    },
  };
}

export function decideReject(
  row: JobRow,
  actorId: string,
  note: string | null | undefined,
  now: Date
): Decision<{ patch: JobPatch }> {
  if (actorId === row.postedBy) return refuse("SELF_REVIEW_FORBIDDEN");
  const trimmed = note?.trim();
  if (!trimmed) return refuse("REVIEW_NOTE_REQUIRED");
  if (row.status !== "PENDING_REVIEW")
    return refuse("INVALID_STATE_TRANSITION");
  return {
    ok: true,
    patch: {
      status: "REJECTED",
      reviewedBy: actorId,
      reviewedAt: now,
      reviewNote: trimmed,
    },
  };
}

/** FR-JOB (withdrawal), spec J-7. Poster or job.manage only; never sets EXPIRED (worker-only, J-7). */
export function decideClose(
  row: JobRow,
  isOwnerOrManager: boolean
): Decision<{ patch: JobPatch }> {
  if (!isOwnerOrManager) return refuse("NOT_OWNER");
  if (!CLOSE_ELIGIBLE.includes(row.status))
    return refuse("INVALID_STATE_TRANSITION");
  return {
    ok: true,
    patch: {
      status: "CLOSED",
      reviewedBy: row.reviewedBy,
      reviewedAt: row.reviewedAt,
      reviewNote: row.reviewNote,
    },
  };
}
