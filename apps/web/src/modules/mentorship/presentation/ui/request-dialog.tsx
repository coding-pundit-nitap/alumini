"use client";

import { Button } from "@nitap/ui/components/button";
import { useState, useTransition, type FormEvent } from "react";

import type { ActionResult } from "@/lib/action-result";

const MESSAGE_MAX = 500;
const FIELD_CLASS =
  "border-input bg-background w-full rounded-lg border px-2.5 py-2 text-sm";

/** Ask a mentor for a mentorship (FR-MENTOR-004). A native <dialog> gives focus trapping and Escape for free. */
export function RequestDialog({
  mentor,
  requestAction,
}: {
  mentor: { userId: string; fullName: string; spotsLeft: number };
  requestAction: (
    mentorId: string,
    input: { message: string; topic?: string }
  ) => Promise<ActionResult<unknown>>;
}) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [topic, setTopic] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const full = mentor.spotsLeft <= 0;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const trimmedTopic = topic.trim();
      const result = await requestAction(mentor.userId, {
        message,
        ...(trimmedTopic ? { topic: trimmedTopic } : {}),
      });
      if (result.ok) {
        setOpen(false);
        setMessage("");
        setTopic("");
      } else setError(result.error.message);
    });
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={full}
        onClick={() => setOpen(true)}
      >
        Request mentorship
      </Button>
      {full ? (
        <span className="text-muted-foreground ml-2 text-sm">
          No spots left
        </span>
      ) : null}
      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Request mentorship from ${mentor.fullName}`}
          className="bg-background mt-2 rounded-lg border p-4"
        >
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="space-y-1 text-sm">
              <label htmlFor={`${mentor.userId}-message`} className="block">
                Message
              </label>
              <textarea
                id={`${mentor.userId}-message`}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                maxLength={MESSAGE_MAX}
                required
                className={`${FIELD_CLASS} min-h-24`}
              />
              <span className="text-muted-foreground block text-xs">
                {message.length}/{MESSAGE_MAX}
              </span>
            </div>
            <label className="block space-y-1 text-sm">
              <span>Topic (optional)</span>
              <input
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                maxLength={40}
                className={`${FIELD_CLASS} h-9`}
              />
            </label>
            {error ? (
              <p role="alert" className="text-destructive text-sm">
                {error}
              </p>
            ) : null}
            <div className="flex gap-2">
              <Button type="submit" size="sm" disabled={pending}>
                {pending ? "Sending…" : "Send request"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
            </div>
          </form>
        </div>
      ) : null}
    </>
  );
}
