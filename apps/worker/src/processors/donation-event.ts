import type { DonationEventPayload } from "@nitap/jobs";
import type { JobProcessor } from "@nitap/queue";

import type { DeliverNotification } from "../notifications/deliver.ts";

/**
 * `donation.pledged` tells every campaign manager except the donor;
 * `donation.confirmed` / `donation.not-received` tell the donor. In-app + email, TRANSACTIONAL:
 * they are records of money, not engagement. Payload ids only.
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
