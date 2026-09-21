import { z } from "zod";

import { defineJob } from "./define-job.ts";

export const idempotencySweepPayload = z.object({ v: z.literal(1) }).strict();
export type IdempotencySweepPayload = z.infer<typeof idempotencySweepPayload>;

/** Deletes `Idempotency-Key` rows older than their 24 h retention (API spec §1.6). */
export const idempotencySweep = defineJob({
  name: "idempotency.sweep",
  version: 1,
  queue: "scheduled",
  schema: idempotencySweepPayload,
  retry: { attempts: 3, baseDelayMs: 60_000, maxDelayMs: 600_000, jitter: 0.2 },
  timeoutMs: 120_000,
  idempotency:
    "Deleting rows that are already gone is a no-op, so running twice has the same effect as once.",
});
