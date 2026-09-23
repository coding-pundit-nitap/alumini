import Link from "next/link";

import type { ListedJob } from "../../application/job-queries";
import type { JobStatus } from "../../domain/job";

const STATUS_LABEL: Record<JobStatus, string> = {
  PENDING_REVIEW: "Pending review",
  PUBLISHED: "Published",
  REJECTED: "Rejected",
  EXPIRED: "Expired",
  CLOSED: "Closed",
};

/** FR-JOB. The caller's own postings, any status. `withdrawSlot` (added in slice 7c) renders a Withdraw action per row. */
export function MyJobsList({
  items,
  withdrawSlot,
}: {
  items: ListedJob[];
  withdrawSlot?: (job: ListedJob) => React.ReactNode;
}) {
  if (items.length === 0) {
    return (
      <p className="text-muted-foreground py-8 text-center">
        No postings yet.{" "}
        <Link href="/jobs/new" className="underline">
          Post a job
        </Link>
      </p>
    );
  }
  return (
    <ul className="divide-border divide-y rounded-lg border">
      {items.map((job) => (
        <li key={job.id} className="flex items-start justify-between gap-4 p-4">
          <div className="min-w-0 space-y-1">
            <p className="font-medium">{job.title}</p>
            <p className="text-muted-foreground text-sm">{job.company}</p>
            {job.status === "REJECTED" && job.reviewNote ? (
              <p className="text-destructive text-sm">
                Reviewer note: {job.reviewNote}
              </p>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="bg-muted rounded-full px-2 py-0.5 text-xs">
              {STATUS_LABEL[job.status]}
            </span>
            <Link
              href={`/jobs/${job.id}/edit`}
              className="text-sm underline underline-offset-2"
            >
              Edit
            </Link>
            {withdrawSlot ? withdrawSlot(job) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}
