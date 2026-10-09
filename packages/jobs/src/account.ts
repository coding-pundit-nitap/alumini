import { z } from "zod";

import { defineJob } from "./define-job.ts";

const verificationDecidedPayload = z
  .object({
    v: z.literal(1),
    requestId: z.uuid(),
    /** The applicant, who is notified. */
    userId: z.uuid(),
    /** A decided request never changes, so the consumer may trust it. */
    decision: z.enum(["APPROVED", "REJECTED"]),
  })
  .strict();
export type VerificationDecidedPayload = z.infer<
  typeof verificationDecidedPayload
>;

const accountStatePayload = z
  .object({
    v: z.literal(1),
    /** The subject, who is notified. */
    userId: z.uuid(),
    /** The administrator who acted. */
    actorId: z.uuid(),
  })
  .strict();
export type AccountStatePayload = z.infer<typeof accountStatePayload>;

const options = {
  version: 1,
  queue: "default",
  retry: { attempts: 5, baseDelayMs: 5_000, maxDelayMs: 300_000, jitter: 0.2 },
  timeoutMs: 10_000,
  idempotency:
    "deliver() keys the notification by (type, job id, recipient), so a rerun finds the existing row and enqueues no second email. Running twice has the same effect as once.",
} as const;

/** Staff decisions about an account, written to the outbox with the decision. */
export const verificationDecided = defineJob({
  ...options,
  name: "verification.decided",
  schema: verificationDecidedPayload,
});
export const userSuspended = defineJob({
  ...options,
  name: "user.suspended",
  schema: accountStatePayload,
});
export const userReactivated = defineJob({
  ...options,
  name: "user.reactivated",
  schema: accountStatePayload,
});
