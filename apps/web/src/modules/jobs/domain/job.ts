/**
 * No DRAFT: creating submits. REJECTED is not terminal, since an edit resubmits it. Self-review is
 * refused here as well as by RBAC.
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

/** The material fields: changing any of these on a PUBLISHED job forces re-review. */
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

/** Create and submit are one action; the outcome depends only on the actor's own permission. */
export function decideCreate(actorHasApprove: boolean): {
  ok: true;
  status: JobStatus;
  directPublish: boolean;
  event: JobEventType;
} {
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

export function decideEdit(
  row: JobRow,
  materialChanged: boolean,
  isOwnerOrManager: boolean
): Decision<{ patch: JobPatch; event: "job.submitted" | null }> {
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

/** The DB's guarded UPDATE (WHERE status = 'PENDING_REVIEW') is the race backstop. */
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

/** Withdrawal. Poster or job.manage only; never sets EXPIRED (the worker does). */
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
