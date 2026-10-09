import type { DonationEventPayload } from "@nitap/jobs";
import type { JobProcessor } from "@nitap/queue";

import type { DeliverNotification } from "../notifications/deliver.ts";

/**
 * Pledges notify campaign managers; confirmations and non-receipts notify the donor. Transactional,
 * since they are records of money.
 */
export function createDonationEventProcessor(
  type: "donation.pledged" | "donation.confirmed" | "donation.not-received",
  deps: {
    deliver: DeliverNotification;
    findEmail: (userId: string) => Promise<string | null>;
    findManagers: (permission: "campaign.manage") => Promise<string[]>;
  }
): JobProcessor<DonationEventPayload> {
  return async (payload, { signal, jobId: eventId }) => {
    const send = async (recipientId: string) =>
      deps.deliver({
        eventId,
        type,
        category: "TRANSACTIONAL",
        recipientId,
        payload: {
          donationId: payload.donationId,
          campaignId: payload.campaignId,
        },
        emailTo: (await deps.findEmail(recipientId)) ?? undefined,
      });

    if (type !== "donation.pledged") return send(payload.donorId);
    for (const id of await deps.findManagers("campaign.manage")) {
      signal.throwIfAborted(); // timed out: stop, the retry resumes (deliver dedupes)
      if (id !== payload.donorId) await send(id);
    }
  };
}
