"use client";

import { ImagePlus, Link2, Loader2, X } from "lucide-react";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
} from "react";

import { Button, buttonVariants } from "@nitap/ui/components/button";
import { Input } from "@nitap/ui/components/input";
import { Textarea } from "@nitap/ui/components/textarea";

import type { ActionResult } from "@/lib/action-result";
import { cn } from "@/lib/utils";

import type { PostAuthor } from "../../application/posts-store";
import { PostAuthorAvatar } from "./post-author";

const MAX_CONTENT = 5000;
const COUNTER_THRESHOLD = 4500;
const MAX_IMAGES = 4;
const POLL_INTERVAL_MS = 2000;
const POLL_MAX_ATTEMPTS = 15;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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

type UploadResult =
  { ok: true; uploadId: string } | { ok: false; message: string };

/**
 * Runs one file through the presign → upload → complete → poll flow (Phase 3C upload contract).
 * Module-level so it carries no component state — the composer only tracks the result by slot key.
 */
async function uploadImage(
  file: File,
  actions: {
    presignAction: PresignAction;
    completeAction: CompleteAction;
    statusAction: StatusAction;
  },
  poll: { intervalMs: number; maxAttempts: number }
): Promise<UploadResult> {
  const presigned = await actions.presignAction({
    mime: file.type,
    size: file.size,
  });
  if (!presigned.ok) return { ok: false, message: presigned.error.message };

  const { uploadId, url, fields } = presigned.data;
  const form = new FormData();
  for (const [name, value] of Object.entries(fields)) form.set(name, value);
  form.set("file", file);

  const response = await fetch(url, { method: "POST", body: form });
  if (!response.ok) {
    return { ok: false, message: "The upload did not go through." };
  }

  const completed = await actions.completeAction(uploadId);
  if (!completed.ok) return { ok: false, message: completed.error.message };
  if (completed.data.status === "READY") return { ok: true, uploadId };

  for (let attempt = 0; attempt < poll.maxAttempts; attempt += 1) {
    await sleep(poll.intervalMs);
    const result = await actions.statusAction(uploadId);
    if (!result.ok) return { ok: false, message: result.error.message };
    if (result.data.status === "READY") return { ok: true, uploadId };
    if (result.data.status === "REJECTED") {
      return {
        ok: false,
        message: result.data.rejectReason ?? "This image was rejected.",
      };
    }
  }
  return { ok: false, message: "Still processing." };
}

type Slot = {
  key: string;
  previewUrl: string;
  phase: "working" | "ready" | "error";
  uploadId?: string;
  message?: string;
};

/**
 * The compose form (FR-FEED-001): collapsed to a single prompt row until clicked or focused
 * (the shell's Create action jumps focus here), then an autosizing textarea, up to 4 images
 * wired to the Phase 3C upload flow, and an optional https link.
 */
export function PostComposer({
  onSubmit,
  presignAction,
  completeAction,
  statusAction,
  author,
  pollIntervalMs = POLL_INTERVAL_MS,
  pollMaxAttempts = POLL_MAX_ATTEMPTS,
}: {
  onSubmit: SubmitAction;
  presignAction: PresignAction;
  completeAction: CompleteAction;
  statusAction: StatusAction;
  author?: PostAuthor;
  pollIntervalMs?: number;
  pollMaxAttempts?: number;
}) {
  const linkId = useId();
  const fileInputId = useId();
  const [expanded, setExpanded] = useState(false);
  const [content, setContent] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [showLink, setShowLink] = useState(false);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const slotsRef = useRef(slots);

  useEffect(() => {
    slotsRef.current = slots;
  }, [slots]);

  useEffect(() => {
    if (expanded) textareaRef.current?.focus();
  }, [expanded]);

  // Revoke every outstanding object URL on unmount only; per-slot revokes happen on remove/reset.
  useEffect(() => {
    return () => {
      for (const slot of slotsRef.current) URL.revokeObjectURL(slot.previewUrl);
    };
  }, []);

  const trimmed = content.trim();
  const working = slots.filter((slot) => slot.phase === "working");
  const readyIds = slots
    .filter((slot) => slot.phase === "ready")
    .map((slot) => slot.uploadId!);
  const canSubmit =
    trimmed.length > 0 &&
    trimmed.length <= MAX_CONTENT &&
    working.length === 0 &&
    !submitting;

  function expand() {
    setExpanded(true);
  }

  function resetDraft() {
    for (const slot of slots) URL.revokeObjectURL(slot.previewUrl);
    setContent("");
    setLinkUrl("");
    setShowLink(false);
    setSlots([]);
  }

  function onCancel() {
    resetDraft();
    setError(null);
    setExpanded(false);
  }

  function onFilesChange(event: ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(event.target.files ?? []).slice(
      0,
      MAX_IMAGES - slots.length
    );
    event.target.value = "";
    if (picked.length === 0) return;

    const newSlots = picked.map((file) => ({
      key: crypto.randomUUID(),
      file,
      previewUrl: URL.createObjectURL(file),
    }));
    setSlots((prev) => [
      ...prev,
      ...newSlots.map(({ key, previewUrl }): Slot => ({
        key,
        previewUrl,
        phase: "working",
      })),
    ]);

    for (const { key, file } of newSlots) {
      uploadImage(
        file,
        { presignAction, completeAction, statusAction },
        { intervalMs: pollIntervalMs, maxAttempts: pollMaxAttempts }
      ).then((result) => {
        setSlots((prev) =>
          prev.map((slot) =>
            slot.key !== key
              ? slot
              : result.ok
                ? { ...slot, phase: "ready", uploadId: result.uploadId }
                : { ...slot, phase: "error", message: result.message }
          )
        );
      });
    }
  }

  function removeSlot(key: string) {
    setSlots((prev) => {
      const target = prev.find((slot) => slot.key === key);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((slot) => slot.key !== key);
    });
  }

  function onTextareaKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  }

  async function onFormSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    const result = await onSubmit({
      content: trimmed,
      imageUrls: readyIds,
      linkUrl: linkUrl.trim() === "" ? undefined : linkUrl.trim(),
    });
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    setError(null);
    resetDraft();
    setExpanded(false);
  }

  const imagesFull = slots.length >= MAX_IMAGES;

  if (!expanded) {
    return (
      <div className="bg-card flex items-center gap-3 rounded-xl border p-3">
        {author ? <PostAuthorAvatar author={author} /> : null}
        <button
          id="compose"
          type="button"
          onClick={expand}
          onFocus={expand}
          className="text-muted-foreground hover:bg-muted flex-1 rounded-lg px-3 py-1.5 text-left text-sm transition-colors"
        >
          Share something with your batchmates…
        </button>
      </div>
    );
  }

  return (
    <form
      onSubmit={onFormSubmit}
      className="bg-card space-y-3 rounded-xl border p-3"
    >
      <Textarea
        ref={textareaRef}
        aria-label="Post content"
        value={content}
        maxLength={MAX_CONTENT}
        onChange={(event) => setContent(event.target.value)}
        onKeyDown={onTextareaKeyDown}
        className="border-0 bg-transparent px-0 text-base shadow-none focus-visible:ring-0 md:text-base"
      />

      {slots.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {slots.map((slot, index) => (
            <div
              key={slot.key}
              className="bg-muted relative size-20 overflow-hidden rounded-lg border"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- local object URL preview, not an optimizable remote image */}
              <img
                src={slot.previewUrl}
                alt=""
                className="size-full object-cover"
              />
              {slot.phase === "working" ? (
                <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                  <Loader2
                    className="size-5 animate-spin text-white"
                    aria-hidden="true"
                  />
                </div>
              ) : null}
              {slot.phase === "error" ? (
                <div
                  className="bg-destructive/70 absolute inset-0"
                  title={slot.message}
                />
              ) : null}
              <button
                type="button"
                aria-label={`Remove image ${index + 1}`}
                onClick={() => removeSlot(slot.key)}
                className="absolute top-1 right-1 rounded-full bg-black/60 p-0.5 text-white hover:bg-black/80"
              >
                <X className="size-3" aria-hidden="true" />
              </button>
            </div>
          ))}
        </div>
      ) : null}

      {showLink ? (
        <div className="space-y-1.5">
          <label htmlFor={linkId} className="text-sm font-medium">
            Link (https)
          </label>
          <Input
            id={linkId}
            type="url"
            value={linkUrl}
            onChange={(event) => setLinkUrl(event.target.value)}
            placeholder="https://…"
          />
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      ) : null}

      <div className="flex items-center gap-1">
        <label
          htmlFor={fileInputId}
          className={cn(
            buttonVariants({ variant: "ghost", size: "sm" }),
            "cursor-pointer",
            imagesFull && "pointer-events-none opacity-50"
          )}
        >
          <ImagePlus aria-hidden="true" />
          <span className="hidden sm:inline">Add images</span>
        </label>
        <input
          id={fileInputId}
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp"
          aria-label="Add images"
          disabled={imagesFull}
          onChange={onFilesChange}
          className="sr-only"
        />

        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-pressed={showLink}
          onClick={() => setShowLink((prev) => !prev)}
        >
          <Link2 aria-hidden="true" />
          <span className="hidden sm:inline">Add link</span>
        </Button>

        {content.length > COUNTER_THRESHOLD ? (
          <span className="text-muted-foreground text-xs">
            {content.length}/{MAX_CONTENT}
          </span>
        ) : null}

        <div className="ml-auto flex items-center gap-1.5">
          <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" variant="brand" size="sm" disabled={!canSubmit}>
            {submitting ? "Posting…" : "Post"}
          </Button>
        </div>
      </div>
    </form>
  );
}
