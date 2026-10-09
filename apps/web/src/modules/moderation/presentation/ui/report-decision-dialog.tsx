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
  AlertDialogTrigger,
} from "@nitap/ui/components/alert-dialog";
import { Button } from "@nitap/ui/components/button";
import { useId, useState, useTransition } from "react";

import type { ActionResult } from "@/lib/action-result";

import { DISMISS_REASONS, RESOLVE_REASONS } from "../../domain/moderation";
import { REASON_LABELS } from "./labels";

const COPY = {
  resolve: {
    label: "Resolve",
    confirm: "Resolve report",
    effect:
      "The reported content is removed or hidden, and the reporter is told it was reviewed.",
    reasons: RESOLVE_REASONS,
  },
  dismiss: {
    label: "Dismiss",
    confirm: "Dismiss report",
    effect: "Nothing is removed. The reporter is told it was reviewed.",
    reasons: DISMISS_REASONS,
  },
} as const;

/**
 * Resolve or dismiss with a required reason code. Shared by the feed and
 * /admin/reports/[id].
 */
export function ReportDecisionDialog(props: {
  outcome: "resolve" | "dismiss";
  reportId: string;
  action: (
    reportId: string,
    reason: string
  ) => Promise<ActionResult<Record<string, never>>>;
  disabledReason?: string;
}) {
  const copy = COPY[props.outcome];
  const selectId = useId();
  const noteId = useId();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      setReason("");
      setError(null);
    }
  }

  function submit() {
    startTransition(async () => {
      const result = await props.action(props.reportId, reason);
      if (!result.ok) {
        setError(result.error.fields?.reason ?? result.error.message);
        return;
      }
      onOpenChange(false);
    });
  }

  return (
    <div className="flex flex-col gap-1">
      <AlertDialog open={open} onOpenChange={onOpenChange}>
        <AlertDialogTrigger
          render={
            <Button
              type="button"
              size="sm"
              variant={props.outcome === "resolve" ? "outline" : "ghost"}
              className="rounded-full"
              disabled={props.disabledReason !== undefined}
              aria-describedby={props.disabledReason ? noteId : undefined}
            />
          }
        >
          {copy.label}
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{copy.confirm}?</AlertDialogTitle>
            <AlertDialogDescription>{copy.effect}</AlertDialogDescription>
          </AlertDialogHeader>
          <label
            htmlFor={selectId}
            className="flex flex-col gap-1 text-sm font-medium"
          >
            Reason
            <select
              id={selectId}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="border-input bg-background h-9 w-full rounded-lg border px-2.5 text-sm"
            >
              <option value="" disabled>
                Choose a reason
              </option>
              {copy.reasons.map((r) => (
                <option key={r} value={r}>
                  {REASON_LABELS[r]}
                </option>
              ))}
            </select>
          </label>
          {error ? (
            <p role="alert" className="text-destructive text-sm">
              {error}
            </p>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={pending || !reason} onClick={submit}>
              {copy.confirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {props.disabledReason ? (
        <p id={noteId} className="text-muted-foreground text-xs">
          {props.disabledReason}
        </p>
      ) : null}
    </div>
  );
}
