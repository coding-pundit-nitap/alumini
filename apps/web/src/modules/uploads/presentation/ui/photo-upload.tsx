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
 * Own-profile photo (spec 3C). Not a `<form>`: the browser POSTs the file straight to the object store
 * via the presigned URL, bytes never touching this process, then the component polls while the worker
 * scans it. `router` is unused here on purpose — `setProfilePhotoAction` itself calls `refresh()`
 * server-side, which re-renders this page with the new `photoUrl`.
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
    <div className="space-y-3">
      {photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- a presigned, auth-checked route; not a static asset.
        <img
          src={photoUrl}
          alt="Profile photo"
          className="size-24 rounded-full object-cover"
        />
      ) : (
        <p className="text-muted-foreground text-sm">No photo yet.</p>
      )}

      <div className="space-y-1.5">
        <label htmlFor={inputId} className="text-sm font-medium">
          Choose a photo
        </label>
        <input
          id={inputId}
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={onFileChange}
          disabled={state.phase === "working"}
        />
      </div>

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
        <Button type="button" onClick={onSetPhoto} disabled={settingPhoto}>
          {settingPhoto ? "Saving…" : "Set as profile photo"}
        </Button>
      ) : null}
    </div>
  );
}
