import { z } from "zod";

import { defineJob } from "./define-job.ts";

export const uploadScanPayload = z
  .object({ v: z.literal(1), uploadId: z.uuid() })
  .strict();
export type UploadScanPayload = z.infer<typeof uploadScanPayload>;

/**
 * The scan's fixed re-encode target (spec 3C). Lives here, not in the web app's domain or the worker,
 * because both need it: web's upload rules describe the product decision, the worker's `upload.scan`
 * processor produces it. One source of truth in the shared contract package.
 */
export const IMAGE_OUTPUT = { size: 512, format: "webp" } as const;

/** Scans and re-encodes a pending upload (spec 3C). Looks the row up by id; a row already READY or
 * REJECTED is a no-op, so a re-delivered job is harmless. */
export const uploadScan = defineJob({
  name: "upload.scan",
  version: 1,
  queue: "default",
  schema: uploadScanPayload,
  retry: { attempts: 5, baseDelayMs: 5_000, maxDelayMs: 300_000, jitter: 0.2 },
  timeoutMs: 60_000,
  idempotency:
    "Looks up the upload by id; a row already READY or REJECTED is a no-op.",
});

export const uploadSweepPayload = z.object({ v: z.literal(1) }).strict();
export type UploadSweepPayload = z.infer<typeof uploadSweepPayload>;

/** Deletes PENDING_UPLOAD rows (and their objects, best-effort) older than 24h (spec 3C F-3). */
export const uploadSweep = defineJob({
  name: "upload.sweep",
  version: 1,
  queue: "scheduled",
  schema: uploadSweepPayload,
  retry: { attempts: 3, baseDelayMs: 60_000, maxDelayMs: 600_000, jitter: 0.2 },
  timeoutMs: 120_000,
  idempotency:
    "Deleting rows that are already gone (or no longer expired) is a no-op, so running twice has the same effect as once.",
});
