import { z } from "zod";

import { defineJob } from "./define-job.ts";

/** Deletes outbox rows published more than the retention window ago. */
export const outboxPrune = defineJob({
  name: "outbox.prune",
  version: 1,
  queue: "scheduled",
  schema: z.object({ v: z.literal(1) }).strict(),
  retry: { attempts: 3, baseDelayMs: 60_000, maxDelayMs: 600_000, jitter: 0.2 },
  timeoutMs: 120_000,
  idempotency:
    "Deleting rows that are already gone is a no-op, so running twice has the same effect as once.",
});
