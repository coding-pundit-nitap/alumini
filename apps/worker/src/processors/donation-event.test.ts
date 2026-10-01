import { describe, expect, it, vi } from "vitest";

import { silentLogger } from "../../tests/support.ts";
import type { DeliverInput } from "../notifications/deliver.ts";
import { createDonationEventProcessor } from "./donation-event.ts";

const ID = (n: number) => `00000000-0000-4000-8000-00000000000${n}`;
const payload = {
  v: 1 as const,
  donationId: ID(1),
  campaignId: ID(2),
  donorId: ID(3),
};
const context = {
  jobId: "evt-1",
  attempt: 1,
  requestId: null,
  signal: new AbortController().signal,
  logger: silentLogger(),
};

function setup() {
  const deliver = vi.fn<(input: DeliverInput) => Promise<void>>(async () => {});
  const deps = {
    deliver,
    findEmail: vi.fn(async (id: string) => `${id}@example.test`),
    findManagers: vi.fn(async () => [ID(4), ID(3), ID(5)]),
  };
  return { deliver, deps };
}

describe("donation event processor (12H H-7)", () => {
  it("pledged: every manager but the donor, in-app + email, ids only", async () => {
    const { deliver, deps } = setup();
    await createDonationEventProcessor("donation.pledged", deps)(
      payload,
      context
    );
    expect(deps.findManagers).toHaveBeenCalledWith("campaign.manage");
    expect(deliver.mock.calls.map(([c]) => c.recipientId)).toEqual([
      ID(4),
      ID(5),
    ]);
    expect(deliver).toHaveBeenCalledWith({
      eventId: "evt-1",
      type: "donation.pledged",
      category: "TRANSACTIONAL",
      recipientId: ID(4),
      payload: { donationId: ID(1), campaignId: ID(2) },
      emailTo: `${ID(4)}@example.test`,
    });
  });

  it.each(["donation.confirmed", "donation.not-received"] as const)(
    "%s goes to the donor only",
    async (type) => {
      const { deliver, deps } = setup();
      await createDonationEventProcessor(type, deps)(payload, context);
      expect(deps.findManagers).not.toHaveBeenCalled();
      expect(deliver).toHaveBeenCalledOnce();
      expect(deliver).toHaveBeenCalledWith(
        expect.objectContaining({ type, recipientId: ID(3) })
      );
    }
  );
});
