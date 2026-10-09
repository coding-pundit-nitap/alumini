"use client";

import { BriefcaseBusiness } from "lucide-react";
import Link from "next/link";

import { Badge } from "@nitap/ui/components/badge";
import { Button, buttonVariants } from "@nitap/ui/components/button";
import { useState } from "react";

import type { ActionResult } from "@/lib/action-result";
import { relativeTime } from "@/lib/relative-time";

import type { ListedJob } from "../../application/job-queries";
import type { JobStatus } from "../../domain/job";
import { STATUS_LABEL } from "../labels";
import { CompanyMark, Deadline } from "./job-parts";
import { useJobAction } from "./use-job-action";

const WITHDRAWABLE: readonly JobStatus[] = ["PENDING_REVIEW", "PUBLISHED"];
const TERMINAL: readonly JobStatus[] = ["EXPIRED", "CLOSED"];

const STATUS_BADGE: Record<
  JobStatus,
  "success" | "brand" | "destructive" | "secondary"
> = {
  PUBLISHED: "success",
  PENDING_REVIEW: "brand",
  REJECTED: "destructive",
  EXPIRED: "secondary",
  CLOSED: "secondary",
};

/** `closeAction` must be the Server Action itself, not a closure, to cross into this Client Component. */
export function MyJobsList({
  items,
  closeAction,
  nextHref = null,
}: {
  items: ListedJob[];
  closeAction?: (jobId: string) => Promise<ActionResult<unknown>>;
  /** "Older postings" link to the next page, by cursor. */
  nextHref?: string | null;
}) {
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
        <span className="bg-muted text-muted-foreground flex size-12 items-center justify-center rounded-full">
          <BriefcaseBusiness aria-hidden className="size-5" />
        </span>
        <p className="text-muted-foreground max-w-xs text-sm">
          No postings yet.
        </p>
        <Link
          href="/jobs/new"
          className={buttonVariants({ size: "sm", className: "rounded-full" })}
        >
          Post a job
        </Link>
      </div>
    );
  }
  return (
    <div>
      <ul className="divide-border divide-y">
        {items.map((job) => {
          const editable = !TERMINAL.includes(job.status);
          return (
            <li key={job.id} className="flex gap-3 px-4 py-4 sm:px-5">
              <CompanyMark company={job.company} />
              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 leading-tight">
                    <h2 className="font-medium">
                      <Link
                        href={`/jobs/${job.id}`}
                        className="underline-offset-2 hover:underline"
                      >
                        {job.title}
                      </Link>
                    </h2>
                    <p className="text-muted-foreground text-sm">
                      {job.company}
                    </p>
                  </div>
                  <Badge variant={STATUS_BADGE[job.status]}>
                    {STATUS_LABEL[job.status]}
                  </Badge>
                </div>
                <p className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                  <span suppressHydrationWarning>
                    Posted {relativeTime(job.createdAt)}
                  </span>
                  {job.status === "PUBLISHED" ? (
                    <Deadline deadline={job.deadline} />
                  ) : null}
                </p>
                {job.status === "REJECTED" && job.reviewNote ? (
                  <p className="border-destructive/30 bg-destructive/5 rounded-lg border px-3 py-2 text-sm">
                    <span className="text-destructive font-medium">
                      Reviewer note:
                    </span>{" "}
                    {job.reviewNote}
                  </p>
                ) : null}
                {editable || closeAction ? (
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    {editable ? (
                      <Link
                        href={`/jobs/${job.id}/edit`}
                        className={buttonVariants({
                          variant: "outline",
                          size: "sm",
                          className: "rounded-full",
                        })}
                      >
                        Edit
                      </Link>
                    ) : null}
                    {closeAction && WITHDRAWABLE.includes(job.status) ? (
                      <WithdrawButton
                        jobId={job.id}
                        closeAction={closeAction}
                      />
                    ) : null}
                  </div>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
      {nextHref ? (
        <div className="flex justify-center border-t py-4">
          <Link
            href={nextHref}
            className={buttonVariants({
              variant: "ghost",
              size: "sm",
              className: "text-muted-foreground rounded-full",
            })}
          >
            Older postings
          </Link>
        </div>
      ) : null}
    </div>
  );
}

/** A confirm-then-close control for one row of `/jobs/mine`. */
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
      <span className="flex flex-wrap items-center gap-1">
        <Button
          size="sm"
          variant="destructive"
          className="rounded-full"
          disabled={pending}
          onClick={() => run(() => closeAction(jobId))}
        >
          Confirm
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="rounded-full"
          onClick={() => setConfirming(false)}
        >
          Keep
        </Button>
        {error ? (
          <span className="text-destructive text-xs">{error}</span>
        ) : null}
      </span>
    );
  }
  return (
    <Button
      size="sm"
      variant="ghost"
      className="text-muted-foreground rounded-full"
      onClick={() => setConfirming(true)}
    >
      Withdraw
    </Button>
  );
}
