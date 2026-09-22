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
import { useId, useState } from "react";

import type { ActionResult } from "@/lib/action-result";

import type { ModerationTarget } from "../../domain/moderation";

const MAX_REASON = 1000;

type ReportContentAction = (input: {
  targetType: ModerationTarget;
  targetId: string;
  reason: string;
}) => Promise<ActionResult<{ reportId: string; created: boolean }>>;

/** Files a content report (FR-MOD-001): reason 1-1000 chars, matches `reportContentInput`. */
export function ReportDialog({
  targetType,
  targetId,
  onSubmit,
  onReported,
}: {
  targetType: ModerationTarget;
  targetId: string;
  onSubmit: ReportContentAction;
  onReported?: (reportId: string) => void;
}) {
  const reasonId = useId();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmed = reason.trim();
  const canSubmit =
    trimmed.length > 0 && trimmed.length <= MAX_REASON && !submitting;

  async function onConfirm() {
    if (!canSubmit) return;
    setSubmitting(true);
    const result = await onSubmit({ targetType, targetId, reason: trimmed });
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    setError(null);
    setReason("");
    setOpen(false);
    onReported?.(result.data.reportId);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={<Button type="button" variant="outline" size="sm" />}
      >
        Report
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Report content</DialogTitle>
        </DialogHeader>
        <div className="space-y-1.5">
          <label htmlFor={reasonId} className="text-sm font-medium">
            Reason
          </label>
          <Textarea
            id={reasonId}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
          {error ? (
            <p role="alert" className="text-destructive text-sm">
              {error}
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <DialogClose render={<Button type="button" variant="ghost" />}>
            Cancel
          </DialogClose>
          <Button type="button" disabled={!canSubmit} onClick={onConfirm}>
            Submit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
