"use client";

import { Button } from "@nitap/ui/components/button";
import { useId, useRef, useState } from "react";

import type { ActionResult } from "@/lib/action-result";

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
type SetPhotoAction = (
  uploadId: string
) => Promise<ActionResult<{ saved: true }>>;

type State =
  | { phase: "idle" }
  | { phase: "working" }
  | { phase: "ready"; uploadId: string }
  | { phase: "rejected"; message: string }
  | { phase: "error"; message: string };

const POLL_INTERVAL_MS = 2000;
const POLL_MAX_ATTEMPTS = 15;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Not a `<form>`: the file goes straight to the store, then this polls while the worker scans it.
 * `setProfilePhotoAction` refreshes the page itself.
 */
export function PhotoUpload({
  photoUrl,
  presignAction,
  completeAction,
  statusAction,
  setPhotoAction,
  pollIntervalMs = POLL_INTERVAL_MS,
  pollMaxAttempts = POLL_MAX_ATTEMPTS,
}: {
  photoUrl: string | null;
  presignAction: PresignAction;
  completeAction: CompleteAction;
  statusAction: StatusAction;
  setPhotoAction: SetPhotoAction;
  /** Overridable so tests don't wait on the real 2s cadence. */
  pollIntervalMs?: number;
  pollMaxAttempts?: number;
}) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<State>({ phase: "idle" });
  const [settingPhoto, setSettingPhoto] = useState(false);

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
        return;
      }
      if (result.data.status === "REJECTED") {
        setState({
          phase: "rejected",
          message: result.data.rejectReason ?? "This image was rejected.",
        });
        return;
      }
    }
    setState({
      phase: "error",
      message: "Still processing. Please check back in a moment.",
    });
  }

  async function onFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setState({ phase: "working" });

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
      setState({
        phase: "error",
        message: "The upload did not go through. Please try again.",
      });
      return;
    }

    const completed = await completeAction(uploadId);
    if (!completed.ok) {
      setState({ phase: "error", message: completed.error.message });
      return;
    }
    if (completed.data.status === "READY") {
      setState({ phase: "ready", uploadId });
      return;
    }
    if (completed.data.status === "REJECTED") {
      setState({ phase: "rejected", message: "This image was rejected." });
      return;
    }
    await pollUntilResolved(uploadId);
  }

  async function onSetPhoto() {
    if (state.phase !== "ready") return;
    setSettingPhoto(true);
    const result = await setPhotoAction(state.uploadId);
    setSettingPhoto(false);
    if (!result.ok) setState({ phase: "error", message: result.error.message });
  }

  return (
    <div className="flex flex-wrap items-center gap-5">
      {photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- a presigned, auth-checked route; not a static asset.
        <img
          src={photoUrl}
          alt="Profile photo"
          className="ring-border bg-muted size-20 rounded-full object-cover ring-1"
        />
      ) : (
        <span className="bg-muted text-muted-foreground flex size-20 items-center justify-center rounded-full border border-dashed text-center text-[11px] leading-tight">
          No photo yet.
        </span>
      )}

      <div className="min-w-0 flex-1 space-y-2">
        <label htmlFor={inputId} className="block text-sm font-medium">
          Choose a photo
        </label>
        <input
          id={inputId}
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={onFileChange}
          disabled={state.phase === "working"}
          className="text-muted-foreground file:bg-muted file:text-foreground hover:file:bg-muted/70 block w-full text-sm file:mr-3 file:rounded-full file:border-0 file:px-4 file:py-1.5 file:text-sm file:font-medium file:transition-colors disabled:opacity-60"
        />
        <p className="text-muted-foreground text-xs">
          JPEG, PNG or WebP. A square photo works best.
        </p>

        {state.phase === "working" ? (
          <p role="status" className="text-muted-foreground text-sm">
            Uploading…
          </p>
        ) : null}
        {state.phase === "error" || state.phase === "rejected" ? (
          <p role="alert" className="text-destructive text-sm">
            {state.message}
          </p>
        ) : null}
        {state.phase === "ready" ? (
          <Button
            type="button"
            variant="brand"
            size="sm"
            className="rounded-full"
            onClick={onSetPhoto}
            disabled={settingPhoto}
          >
            {settingPhoto ? "Saving…" : "Set as profile photo"}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
