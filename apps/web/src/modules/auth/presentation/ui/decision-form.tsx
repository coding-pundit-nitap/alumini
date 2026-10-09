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
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import type { ActionResult } from "@/lib/action-result";

import {
  normaliseNote,
  noteProblem,
  type VerificationDecision,
} from "../../domain/verification-request";
import { DECISION_FIELDS } from "../api/verification-schemas";
import { FormMessage } from "./form-field";

const CONFIRM_COPY: Record<
  VerificationDecision,
  { title: string; description: string; action: string }
> = {
  APPROVED: {
    title: "Approve this request?",
    description: "They become a verified alumnus and get the member network.",
    action: "Approve request",
  },
  REJECTED: {
    title: "Reject this request?",
    description: "They are told it was not approved, with your note.",
    action: "Reject request",
  },
};

/** Rejecting requires a note. The reviewer comes from the session, never the form. */
export function DecisionForm({
  requestId,
  action,
}: {
  requestId: string;
  action: (
    formData: FormData
  ) => Promise<ActionResult<{ outcome: "decided" | "already_decided" }>>;
}) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<VerificationDecision | null>(
    null
  );
  const [pending, startTransition] = useTransition();

  function check(decision: VerificationDecision) {
    const problem = noteProblem(decision, normaliseNote(note));
    if (problem) {
      setError(problem);
      setInfo(null);
      return;
    }
    setError(null);
    setInfo(null);
    setConfirming(decision);
  }

  function send(decision: VerificationDecision) {
    const values: Record<(typeof DECISION_FIELDS)[number], string> = {
      requestId,
      decision,
      note,
    };
    const formData = new FormData();
    for (const key of DECISION_FIELDS) formData.set(key, values[key]);

    startTransition(async () => {
      const result = await action(formData);
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      if (result.data.outcome === "already_decided") {
        setInfo("This request has already been decided by someone else.");
      }
      router.refresh();
    });
  }

  const copy = confirming ? CONFIRM_COPY[confirming] : null;

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium">
        Note (required to reject)
        <textarea
          value={note}
          onChange={(event) => setNote(event.target.value)}
          rows={2}
          className="border-input bg-background mt-1 min-h-16 w-full rounded-lg border px-2.5 py-1 text-sm"
        />
      </label>
      {error ? <FormMessage tone="error">{error}</FormMessage> : null}
      {info ? <FormMessage tone="success">{info}</FormMessage> : null}
      <div className="flex gap-2">
        <Button
          type="button"
          variant="brand"
          className="rounded-full"
          disabled={pending}
          onClick={() => check("APPROVED")}
        >
          Approve
        </Button>
        <Button
          type="button"
          variant="outline"
          className="text-destructive rounded-full"
          disabled={pending}
          onClick={() => check("REJECTED")}
        >
          Reject
        </Button>
      </div>
      <AlertDialog
        open={confirming !== null}
        onOpenChange={(open) => !open && setConfirming(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{copy?.title}</AlertDialogTitle>
            <AlertDialogDescription>{copy?.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant={confirming === "REJECTED" ? "destructive" : "default"}
              onClick={() => {
                if (confirming) send(confirming);
                setConfirming(null);
              }}
            >
              {copy?.action}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
