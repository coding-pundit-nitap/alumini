import type { ListCursor } from "../domain/cursor";
import type {
  EmploymentType,
  JobRow,
  JobStatus,
  WorkMode,
} from "../domain/job";

/** One row of "my jobs" or the moderation queue: every field the poster/moderator needs, own statuses too. */
export type ListedJob = Omit<JobRow, never>;

/** One row of the public listing: PUBLISHED only, so review fields are never sent to the client. */
export type PublishedJobCard = Pick<
  JobRow,
  | "id"
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
  | "createdAt"
>;

export type PublishedJobFilter = {
  employmentType?: EmploymentType;
  workMode?: WorkMode;
  location?: string;
  limit: number;
  after?: ListCursor;
};

export type JobQueries = {
  /** All of the caller's own jobs, any status, newest first. */
  listMine(
    userId: string,
    filter: { limit: number; after?: ListCursor }
  ): Promise<ListedJob[]>;
  /** PENDING_REVIEW only, oldest first (FIFO moderation queue). job.approve callers only (checked by the use case). */
  listPending(filter: {
    limit: number;
    after?: ListCursor;
  }): Promise<ListedJob[]>;
  /** PUBLISHED, deadline >= current_date, exact-match filters, newest first. */
  listPublished(filter: PublishedJobFilter): Promise<PublishedJobCard[]>;
  /** The raw row, unfiltered; the use case applies visibility. */
  get(id: string): Promise<JobRow | null>;
};

export type { JobStatus };
