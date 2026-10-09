import { z } from "zod";

import { defineJob, FANOUT_TIMEOUT_MS } from "./define-job.ts";

/** Ids only: copy never names the donor or the amount. */
const donationPayload = z
  .object({
    v: z.literal(1),
    donationId: z.uuid(),
    campaignId: z.uuid(),
    donorId: z.uuid(),
  })
  .strict();
export type DonationEventPayload = z.infer<typeof donationPayload>;

const options = {
  version: 1,
  queue: "default",
  schema: donationPayload,
  retry: { attempts: 5, baseDelayMs: 5_000, maxDelayMs: 300_000, jitter: 0.2 },
  timeoutMs: 10_000,
  idempotency:
    "deliver() keys the notification by (type, job id, recipient), so a rerun finds the existing rows and enqueues no second email. Running twice has the same effect as once.",
} as const;

/** A member pledged; every campaign manager is told. */
export const donationPledged = defineJob({
  ...options,
  name: "donation.pledged",
  timeoutMs: FANOUT_TIMEOUT_MS,
});
/** A manager confirmed receipt; the donor is told. */
export const donationConfirmed = defineJob({
  ...options,
  name: "donation.confirmed",
});
/** A manager marked the pledge not received, or it expired; the donor is told. */
export const donationNotReceived = defineJob({
  ...options,
  name: "donation.not-received",
});

/**
 * Daily: open pledges with no reference after 30 days become NOT_RECEIVED.
 * Scheduled only.
 */
export const donationExpirePledges = defineJob({
  name: "donation.expire-pledges",
  version: 1,
  queue: "scheduled",
  schema: z.object({ v: z.literal(1) }).strict(),
  retry: { attempts: 3, baseDelayMs: 60_000, maxDelayMs: 600_000, jitter: 0.2 },
  timeoutMs: 120_000,
  idempotency:
    "Each row's flip is a guarded UPDATE (WHERE status = 'PLEDGED' AND payment_reference IS NULL); a row already decided, cancelled or given a reference is skipped, so running twice has the same effect as once.",
});
