"use client";

import { Button } from "@nitap/ui/components/button";
import { X } from "lucide-react";
import { useState, useTransition, type FormEvent } from "react";

import type { ActionResult } from "@/lib/action-result";

const MESSAGE_MAX = 500;
const FIELD_CLASS =
  "border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 w-full rounded-lg border px-3 py-2 text-sm outline-none focus-visible:ring-[3px]";

/**
 * Ask a mentor for a mentorship. showModal() on a native <dialog> gives focus
 * trapping and Escape.
 */
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
      {full ? (
        <span className="text-muted-foreground mr-2 text-xs">
          No spots left
        </span>
      ) : null}
      <Button
        type="button"
        variant={full ? "outline" : "brand"}
        size="sm"
        className="rounded-full"
        disabled={full}
        onClick={() => setOpen(true)}
      >
        Request mentorship
      </Button>
      {open ? (
        <dialog
          ref={(el) => {
            if (el && !el.open) el.showModal();
          }}
          onClose={() => setOpen(false)}
          aria-label={`Request mentorship from ${mentor.fullName}`}
          className="bg-background text-foreground m-auto w-[calc(100%-2rem)] max-w-md rounded-xl border p-0 shadow-lg backdrop:bg-black/50 backdrop:backdrop-blur-[2px]"
        >
          <div className="flex items-start justify-between gap-3 border-b px-5 py-4">
            <div className="min-w-0 leading-tight">
              <p className="font-semibold">Request mentorship</p>
              <p className="text-muted-foreground truncate text-xs">
                From {mentor.fullName}
              </p>
            </div>
            <button
              type="button"
              aria-label="Close"
              onClick={() => setOpen(false)}
              className="text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-ring -mr-1.5 flex size-8 items-center justify-center rounded-full outline-none focus-visible:ring-2"
            >
              <X aria-hidden className="size-4" />
            </button>
          </div>
          <form
            method="post"
            onSubmit={handleSubmit}
            className="space-y-4 px-5 py-4"
          >
            <div className="space-y-1 text-sm">
              <label
                htmlFor={`${mentor.userId}-message`}
                className="block font-medium"
              >
                Message
              </label>
              <textarea
                id={`${mentor.userId}-message`}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                maxLength={MESSAGE_MAX}
                required
                placeholder="Say who you are and what you would like help with."
                className={`${FIELD_CLASS} min-h-28 resize-y`}
              />
              <span className="text-muted-foreground block text-right text-xs tabular-nums">
                {message.length}/{MESSAGE_MAX}
              </span>
            </div>
            <label className="block space-y-1 text-sm">
              <span className="font-medium">Topic (optional)</span>
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
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="rounded-full"
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="brand"
                size="sm"
                className="rounded-full"
                disabled={pending}
              >
                {pending ? "Sending…" : "Send request"}
              </Button>
            </div>
          </form>
        </dialog>
      ) : null}
    </>
  );
}
