"use client";

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

/**
 * Approve or reject one request. Rejecting needs a note (mirroring the server rule); the reviewer is
 * never a form field: the server takes them from the session.
 */
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
  const [pending, startTransition] = useTransition();

  function decide(decision: VerificationDecision) {
    const problem = noteProblem(decision, normaliseNote(note));
    if (problem) {
      setError(problem);
      setInfo(null);
      return;
    }
    setError(null);
    setInfo(null);

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

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium">
        Note (required to reject)
        <textarea
          value={note}
          onChange={(event) => setNote(event.target.value)}
          rows={2}
          className="border-input bg-background mt-1 w-full rounded-lg border px-2.5 py-1 text-sm"
        />
      </label>
      {error ? <FormMessage tone="error">{error}</FormMessage> : null}
      {info ? <FormMessage tone="success">{info}</FormMessage> : null}
      <div className="flex gap-2">
        <Button
          type="button"
          disabled={pending}
          onClick={() => decide("APPROVED")}
        >
          Approve
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          onClick={() => decide("REJECTED")}
        >
          Reject
        </Button>
      </div>
    </div>
  );
}
