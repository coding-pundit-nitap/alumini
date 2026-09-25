"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@nitap/ui/components/alert-dialog";
import { Button } from "@nitap/ui/components/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@nitap/ui/components/dialog";
import { Textarea } from "@nitap/ui/components/textarea";
import { Briefcase } from "lucide-react";
import { useId, useState, useTransition } from "react";

import type { ActionResult } from "@/lib/action-result";
import { cn } from "@/lib/utils";

import type { ListedJob } from "../../application/job-queries";

const MAX_NOTE = 1000;
const DESCRIPTION_PREVIEW_LENGTH = 240;

function Row({
  job,
  approveAction,
  rejectAction,
}: {
  job: ListedJob;
  approveAction: (jobId: string) => Promise<ActionResult<unknown>>;
  rejectAction: (
    jobId: string,
    reviewNote: string
  ) => Promise<ActionResult<unknown>>;
}) {
  const noteId = useId();
  const [rejectOpen, setRejectOpen] = useState(false);
  const [confirmingApprove, setConfirmingApprove] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [pending, startTransition] = useTransition();

  const canReject =
    note.trim().length > 0 && note.trim().length <= MAX_NOTE && !pending;
  const isLongDescription = job.description.length > DESCRIPTION_PREVIEW_LENGTH;

  function approve() {
    setError(null);
    startTransition(async () => {
      const result = await approveAction(job.id);
      if (!result.ok) setError(result.error.message);
    });
  }
  function reject() {
    if (!canReject) return;
    startTransition(async () => {
      const result = await rejectAction(job.id, note.trim());
      if (!result.ok) setError(result.error.message);
      else {
        setRejectOpen(false);
        setNote("");
      }
    });
  }

  return (
    <li className="space-y-3 p-5">
      <div className="flex items-start gap-3">
        <div className="bg-muted flex size-10 shrink-0 items-center justify-center rounded-lg font-semibold">
          {job.company.charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <p className="font-medium">{job.title}</p>
          <p className="text-muted-foreground text-sm">
            {job.company} · posted {job.createdAt.toLocaleDateString("en-US")}
          </p>
          <p className={cn("text-sm", !expanded && "line-clamp-3")}>
            {job.description}
          </p>
          {isLongDescription ? (
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground text-sm underline"
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded ? "Show less" : "Show more"}
            </button>
          ) : null}
        </div>
      </div>
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="brand"
          className="rounded-full"
          disabled={pending}
          onClick={() => setConfirmingApprove(true)}
        >
          Approve
        </Button>
        <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
          <DialogTrigger
            render={
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="rounded-full"
              />
            }
          >
            Reject
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Reject {job.title}</DialogTitle>
            </DialogHeader>
            <div className="space-y-1.5">
              <label htmlFor={noteId} className="text-sm font-medium">
                Reason
              </label>
              <Textarea
                id={noteId}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>
            <DialogFooter>
              <DialogClose render={<Button type="button" variant="ghost" />}>
                Cancel
              </DialogClose>
              <Button type="button" disabled={!canReject} onClick={reject}>
                Submit rejection
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      <AlertDialog open={confirmingApprove} onOpenChange={setConfirmingApprove}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Approve {job.title}?</AlertDialogTitle>
            <AlertDialogDescription>
              It goes live on the jobs board and the poster is told.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="brand"
              onClick={() => {
                setConfirmingApprove(false);
                approve();
              }}
            >
              Approve job
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {error ? (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      ) : null}
    </li>
  );
}

/** FR-JOB-003. The moderation queue (spec J-6: approve/reject are guarded, single-winner updates). */
export function ModerationQueue({
  items,
  approveAction,
  rejectAction,
}: {
  items: ListedJob[];
  approveAction: (jobId: string) => Promise<ActionResult<unknown>>;
  rejectAction: (
    jobId: string,
    reviewNote: string
  ) => Promise<ActionResult<unknown>>;
}) {
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-14 text-center">
        <div className="bg-muted flex size-12 items-center justify-center rounded-full">
          <Briefcase aria-hidden className="text-muted-foreground size-5" />
        </div>
        <p className="text-muted-foreground text-sm">
          Nothing waiting for review.
        </p>
      </div>
    );
  }
  return (
    <ul className="bg-card divide-border divide-y rounded-xl border">
      {items.map((job) => (
        <Row
          key={job.id}
          job={job}
          approveAction={approveAction}
          rejectAction={rejectAction}
        />
      ))}
    </ul>
  );
}
