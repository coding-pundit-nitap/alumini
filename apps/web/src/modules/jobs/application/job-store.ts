import type {
  JobContent,
  JobEventType,
  JobPatch,
  JobRow,
  JobStatus,
} from "../domain/job";

/** The `job.*` events the outbox carries (contracts in `@nitap/jobs`). Ids only. */
type JobEventBasePayload = {
  v: 1;
  jobId: string;
  postedBy: string;
  actorId: string;
};

/** `job.published` alone carries `directPublish`, matching `@nitap/jobs`'s two distinct payload schemas. */
export type JobEvent =
  | {
      type: Exclude<JobEventType, "job.published">;
      payload: JobEventBasePayload;
    }
  | {
      type: "job.published";
      payload: JobEventBasePayload & { directPublish: boolean };
    };

/** Admin decisions on a job leave an audit row in the same transaction. Ids only. */
export type JobAuditEntry = {
  action: "job.approved" | "job.rejected" | "job.publish_direct" | "job.closed";
  actorId: string;
  jobId: string;
  postedBy: string;
};

export type NewJob = JobContent & { postedBy: string; status: JobStatus };

/** All writes go through one transaction, so a row and its outbox event commit together. */
export type JobTx = {
  findById(id: string): Promise<JobRow | null>;
  insert(input: NewJob): Promise<JobRow>;
  /** Only moves a row still in `from`; null when it had already changed. */
  update(
    id: string,
    from: JobStatus,
    patch: Partial<JobContent> & JobPatch
  ): Promise<JobRow | null>;
  enqueue(event: JobEvent): Promise<void>;
  audit(entry: JobAuditEntry): Promise<void>;
};

export type JobStore = {
  transaction<T>(work: (tx: JobTx) => Promise<T>): Promise<T>;
};

/** One committed outcome, for logs and metrics. `publish_direct` is logged distinctly from `published`. */
export type JobOutcome =
  | "submitted"
  | "published"
  | "publish_direct"
  | "approved"
  | "rejected"
  | "closed";
export type JobObserver = (outcome: JobOutcome, jobId: string) => void;
