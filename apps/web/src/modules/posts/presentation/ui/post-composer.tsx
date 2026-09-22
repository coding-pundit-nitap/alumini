"use client";

import { Button } from "@nitap/ui/components/button";
import { Input } from "@nitap/ui/components/input";
import { Textarea } from "@nitap/ui/components/textarea";
import { useId, useState } from "react";

import type { ActionResult } from "@/lib/action-result";

const MAX_CONTENT = 5000;
const MAX_IMAGES = 4;

type PresignedUpload = {
  uploadId: string;
  url: string;
  fields: Record<string, string>;
};
type UploadStatus = "PENDING_UPLOAD" | "PENDING_SCAN" | "READY" | "REJECTED";

type PresignAction = (input: {
  mime: string;
  size: number;
}) => Promise<ActionResult<PresignedUpload>>;
type CompleteAction = (
  uploadId: string
) => Promise<ActionResult<{ status: UploadStatus }>>;
type StatusAction = (
  uploadId: string
) => Promise<
  ActionResult<{ status: UploadStatus; rejectReason: string | null }>
>;
type SubmitAction = (input: {
  content: string;
  imageUrls: string[];
  linkUrl: string | undefined;
}) => Promise<ActionResult<{ postId: string }>>;

const POLL_INTERVAL_MS = 2000;
const POLL_MAX_ATTEMPTS = 15;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type SlotState =
  | { phase: "idle" }
  | { phase: "working" }
  | { phase: "ready"; uploadId: string }
  | { phase: "error"; message: string };

/** One of PostComposer's up to 4 image pickers, driving the same presign → upload → complete → poll flow as PhotoUpload. */
function ImageSlot({
  index,
  presignAction,
  completeAction,
  statusAction,
  onReady,
  pollIntervalMs,
  pollMaxAttempts,
}: {
  index: number;
  presignAction: PresignAction;
  completeAction: CompleteAction;
  statusAction: StatusAction;
  onReady: (index: number, uploadId: string | null) => void;
  pollIntervalMs: number;
  pollMaxAttempts: number;
}) {
  const inputId = useId();
  const [state, setState] = useState<SlotState>({ phase: "idle" });

  async function pollUntilResolved(uploadId: string) {
    for (let attempt = 0; attempt < pollMaxAttempts; attempt += 1) {
      await sleep(pollIntervalMs);
      const result = await statusAction(uploadId);
      if (!result.ok) {
        setState({ phase: "error", message: result.error.message });
        return;
      }
      if (result.data.status === "READY") {
        setState({ phase: "ready", uploadId });
        onReady(index, uploadId);
        return;
      }
      if (result.data.status === "REJECTED") {
        setState({
          phase: "error",
          message: result.data.rejectReason ?? "This image was rejected.",
        });
        return;
      }
    }
    setState({ phase: "error", message: "Still processing." });
  }

  async function onFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setState({ phase: "working" });
    onReady(index, null);

    const presigned = await presignAction({ mime: file.type, size: file.size });
    if (!presigned.ok) {
      setState({ phase: "error", message: presigned.error.message });
      return;
    }
    const { uploadId, url, fields } = presigned.data;
    const form = new FormData();
    for (const [name, value] of Object.entries(fields)) form.set(name, value);
    form.set("file", file);

    const response = await fetch(url, { method: "POST", body: form });
    if (!response.ok) {
      setState({ phase: "error", message: "The upload did not go through." });
      return;
    }

    const completed = await completeAction(uploadId);
    if (!completed.ok) {
      setState({ phase: "error", message: completed.error.message });
      return;
    }
    if (completed.data.status === "READY") {
      setState({ phase: "ready", uploadId });
      onReady(index, uploadId);
      return;
    }
    await pollUntilResolved(uploadId);
  }

  return (
    <div className="space-y-1">
      <label htmlFor={inputId} className="text-sm font-medium">
        Image {index + 1}
      </label>
      <input
        id={inputId}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={onFileChange}
        disabled={state.phase === "working"}
      />
      {state.phase === "error" ? (
        <p role="alert" className="text-destructive text-xs">
          {state.message}
        </p>
      ) : null}
    </div>
  );
}

/**
 * The compose form (FR-FEED-001): content (5000-char client counter mirroring `postInput`'s server
 * bound), up to 4 image pickers wired to the Phase 3C upload flow, and an optional https link.
 */
export function PostComposer({
  onSubmit,
  presignAction,
  completeAction,
  statusAction,
  pollIntervalMs = POLL_INTERVAL_MS,
  pollMaxAttempts = POLL_MAX_ATTEMPTS,
}: {
  onSubmit: SubmitAction;
  presignAction: PresignAction;
  completeAction: CompleteAction;
  statusAction: StatusAction;
  pollIntervalMs?: number;
  pollMaxAttempts?: number;
}) {
  const contentId = useId();
  const linkId = useId();
  const [content, setContent] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [images, setImages] = useState<(string | null)[]>(
    Array.from({ length: MAX_IMAGES }, () => null)
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmed = content.trim();
  const canSubmit =
    trimmed.length > 0 && trimmed.length <= MAX_CONTENT && !submitting;

  function onImageReady(index: number, uploadId: string | null) {
    setImages((prev) => {
      const next = [...prev];
      next[index] = uploadId;
      return next;
    });
  }

  async function onFormSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    const result = await onSubmit({
      content: trimmed,
      imageUrls: images.filter((id): id is string => id !== null),
      linkUrl: linkUrl.trim() === "" ? undefined : linkUrl.trim(),
    });
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    setError(null);
    setContent("");
    setLinkUrl("");
    setImages(Array.from({ length: MAX_IMAGES }, () => null));
  }

  return (
    <form onSubmit={onFormSubmit} className="space-y-3">
      <div className="space-y-1.5">
        <label htmlFor={contentId} className="text-sm font-medium">
          Content
        </label>
        <Textarea
          id={contentId}
          value={content}
          maxLength={MAX_CONTENT}
          onChange={(event) => setContent(event.target.value)}
        />
        <p className="text-muted-foreground text-xs">
          {content.length} / {MAX_CONTENT}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {images.map((_, index) => (
          <ImageSlot
            key={`image-slot-${index}`}
            index={index}
            presignAction={presignAction}
            completeAction={completeAction}
            statusAction={statusAction}
            onReady={onImageReady}
            pollIntervalMs={pollIntervalMs}
            pollMaxAttempts={pollMaxAttempts}
          />
        ))}
      </div>

      <div className="space-y-1.5">
        <label htmlFor={linkId} className="text-sm font-medium">
          Link (optional)
        </label>
        <Input
          id={linkId}
          type="url"
          value={linkUrl}
          onChange={(event) => setLinkUrl(event.target.value)}
          placeholder="https://…"
        />
      </div>

      {error ? (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      ) : null}

      <Button type="submit" disabled={!canSubmit}>
        {submitting ? "Posting…" : "Post"}
      </Button>
    </form>
  );
}
