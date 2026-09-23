"use client";

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
import { useId, useState, useTransition } from "react";

import type { ActionResult } from "@/lib/action-result";

import type { ListedJob } from "../../application/job-queries";

const MAX_NOTE = 1000;

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
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const canReject =
    note.trim().length > 0 && note.trim().length <= MAX_NOTE && !pending;

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
        setOpen(false);
        setNote("");
      }
    });
  }

  return (
    <li className="space-y-2 p-4">
      <div className="space-y-1">
        <p className="font-medium">{job.title}</p>
        <p className="text-muted-foreground text-sm">
          {job.company} · posted {job.createdAt.toLocaleDateString()}
        </p>
        <p className="text-sm">{job.description}</p>
      </div>
      <div className="flex gap-2">
        <Button size="sm" disabled={pending} onClick={approve}>
          Approve
        </Button>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger
            render={<Button type="button" size="sm" variant="outline" />}
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
      <p className="text-muted-foreground py-8 text-center">
        Nothing waiting for review.
      </p>
    );
  }
  return (
    <ul className="divide-border divide-y rounded-lg border">
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
