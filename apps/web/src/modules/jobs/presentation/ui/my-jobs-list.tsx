"use client";

import { Button } from "@nitap/ui/components/button";
import Link from "next/link";
import { useState } from "react";

import type { ActionResult } from "@/lib/action-result";

import type { ListedJob } from "../../application/job-queries";
import type { JobStatus } from "../../domain/job";
import { STATUS_LABEL } from "../labels";
import { useJobAction } from "./use-job-action";

const WITHDRAWABLE: readonly JobStatus[] = ["PENDING_REVIEW", "PUBLISHED"];

/**
 * FR-JOB. The caller's own postings, any status. `closeAction` (added in slice 7c), when given, renders a
 * Withdraw control on rows still eligible to close. It must be the `closeJobAction` Server Action itself —
 * not a closure — since this is a Client Component and only a Server Action reference crosses that boundary.
 */
export function MyJobsList({
  items,
  closeAction,
}: {
  items: ListedJob[];
  closeAction?: (jobId: string) => Promise<ActionResult<unknown>>;
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
            {closeAction && WITHDRAWABLE.includes(job.status) ? (
              <WithdrawButton jobId={job.id} closeAction={closeAction} />
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}

/** A confirm-then-close control for one row of `/jobs/mine` (spec J-7: poster's own withdrawal). */
export function WithdrawButton({
  jobId,
  closeAction,
}: {
  jobId: string;
  closeAction: (jobId: string) => Promise<ActionResult<unknown>>;
}) {
  const { pending, error, run } = useJobAction();
  const [confirming, setConfirming] = useState(false);

  if (confirming) {
    return (
      <span className="flex items-center gap-1">
        <Button
          size="sm"
          disabled={pending}
          onClick={() => run(() => closeAction(jobId))}
        >
          Confirm
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
          Keep
        </Button>
        {error ? (
          <span className="text-destructive text-xs">{error}</span>
        ) : null}
      </span>
    );
  }
  return (
    <Button size="sm" variant="outline" onClick={() => setConfirming(true)}>
      Withdraw
    </Button>
  );
}
