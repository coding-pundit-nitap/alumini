import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createAuditWriter } from "@nitap/database/audit";
import { createOutboxWriter } from "@nitap/database/outbox";
import { runSeed } from "@nitap/database/seed";
import { createTestDatabase, type TestDatabase } from "@nitap/testing";

import { createTransactionRunner } from "@/infrastructure/database/transaction-runner";
import type { Actor } from "@/modules/auth";
import {
  createCancelPledge,
  createChangeCampaignStatus,
  createConfirmDonation,
  createCreateCampaign,
  createEditCampaign,
  createGetCampaign,
  createListCampaignsForAdmin,
  createListDonationsForAdmin,
  createListMyDonations,
  createListOpenCampaigns,
  createMarkNotReceived,
  createPledgeDonation,
  createSetPledgeReference,
} from "@/modules/donations";
import {
  createPrismaDonationQueries,
  createPrismaDonationStore,
} from "@/modules/donations/server";

const NOW = new Date("2026-10-10T06:00:00Z");
const MISSING = "00000000-0000-4000-8000-000000000000";
const fields = {
  title: "Library fund",
  description: "Books for the central library",
  purpose: "Books",
  paymentInstructions: "UPI: library@bank",
  goal: "10,000",
  startsOn: "2026-10-01",
  endsOn: "2026-10-31",
};
const code = (promise: Promise<unknown>) =>
  promise.then(
    () => "ok",
    (e: { code?: string }) => e.code ?? "error"
  );

describe("donation member and review flows against PostgreSQL", () => {
  let db: TestDatabase;
  let manager: Actor;
  let donor: Actor;
  let other: Actor;
  let viewAll = false;

  const actorFor = async (name: string): Promise<Actor> => {
    const u = await db.prisma.user.create({
      data: { name, email: `${name}@example.test`, accountState: "VERIFIED" },
    });
    return {
      userId: u.id,
      accountState: "VERIFIED",
      requestId: "r",
      grants: [],
    };
  };
  const deps = () => ({
    store: createPrismaDonationStore({
      runner: createTransactionRunner(db.prisma),
      audit: createAuditWriter(),
      outbox: createOutboxWriter(),
    }),
    queries: createPrismaDonationQueries(db.prisma),
    authorize: (a: Actor | null) => a!,
    can: () => viewAll,
    now: () => NOW,
  });
  const newCampaign = async (over: Partial<typeof fields> = {}) =>
    (
      await createCreateCampaign(deps())({
        actor: manager,
        input: { ...fields, ...over },
      })
    ).campaignId;
  const setStatus = (campaignId: string, to: unknown) =>
    createChangeCampaignStatus(deps())({ actor: manager, campaignId, to });
  const pledge = (campaignId: string, paymentReference?: string) =>
    createPledgeDonation(deps())({
      actor: donor,
      campaignId,
      input: { amount: "500", paymentReference },
    });

  beforeEach(async () => {
    db = await createTestDatabase();
    await runSeed(db.prisma);
    viewAll = false;
    manager = await actorFor("manager");
    donor = await actorFor("donor");
    other = await actorFor("other");
  });
  afterEach(() => db.drop());

  it("hides a draft from members, shows an active one, and refuses a pledge to a draft or a closed one", async () => {
    const id = await newCampaign();
    const get = createGetCampaign(deps());
    expect(await code(get({ actor: donor, campaignId: id }))).toBe("NOT_FOUND");
    expect(await code(get({ actor: donor, campaignId: MISSING }))).toBe(
      "NOT_FOUND"
    );
    expect(await code(pledge(id))).toBe("NOT_FOUND");

    await setStatus(id, "ACTIVE");
    expect(await get({ actor: donor, campaignId: id })).toMatchObject({
      campaign: { id, title: "Library fund" },
      acceptsPledges: true,
    });

    await setStatus(id, "CLOSED");
    expect(await code(pledge(id))).toBe("CAMPAIGN_NOT_OPEN");
    const { open, closed } = await createListOpenCampaigns(deps())({
      actor: donor,
    });
    expect(open).toEqual([]);
    expect(closed.map((c) => c.id)).toEqual([id]);
    expect(await code(pledge(MISSING))).toBe("NOT_FOUND");
  });

  it("lets the donor add a reference and cancel their own open pledge, never another's or a decided one", async () => {
    const id = await newCampaign();
    await setStatus(id, "ACTIVE");
    const { donationId } = await pledge(id);
    const setRef = createSetPledgeReference(deps());
    const cancel = createCancelPledge(deps());

    expect(
      await code(
        setRef({
          actor: other,
          donationId,
          input: { paymentReference: "UTR-OTHER" },
        })
      )
    ).toBe("NOT_FOUND");
    expect(
      await code(setRef({ actor: donor, donationId, input: { nope: 1 } }))
    ).toBe("VALIDATION_FAILED");
    expect(
      await setRef({
        actor: donor,
        donationId,
        input: { paymentReference: "UTR-1" },
      })
    ).toEqual({ paymentReference: "UTR-1" });

    const mine = await createListMyDonations(deps())({ actor: donor });
    expect(mine).toEqual([
      expect.objectContaining({
        id: donationId,
        campaignTitle: "Library fund",
        paymentReference: "UTR-1",
        status: "PLEDGED",
      }),
    ]);

    await cancel({ actor: donor, donationId });
    expect(await code(cancel({ actor: donor, donationId }))).toBe(
      "DONATION_ALREADY_DECIDED"
    );
  });

  it("decides pledges: not received with a reason, never one's own, never twice, and needs a reference to confirm", async () => {
    const id = await newCampaign();
    await setStatus(id, "ACTIVE");
    const noRef = await pledge(id);
    const withRef = await pledge(id, "UTR-9");
    const own = await createPledgeDonation(deps())({
      actor: manager,
      campaignId: id,
      input: { amount: "100" },
    });
    const confirm = createConfirmDonation(deps());
    const notReceived = createMarkNotReceived(deps());

    expect(
      await code(
        confirm({ actor: manager, donationId: noRef.donationId, input: {} })
      )
    ).toBe("VALIDATION_FAILED");
    expect(
      await code(confirm({ actor: manager, donationId: MISSING, input: {} }))
    ).toBe("NOT_FOUND");
    expect(
      await code(
        notReceived({
          actor: manager,
          donationId: own.donationId,
          input: { reason: "DUPLICATE" },
        })
      )
    ).toBe("DONATION_SELF_DECISION");
    expect(
      await code(
        notReceived({
          actor: manager,
          donationId: withRef.donationId,
          input: {},
        })
      )
    ).toBe("VALIDATION_FAILED");
    expect(
      await notReceived({
        actor: manager,
        donationId: withRef.donationId,
        input: { reason: "NO_PAYMENT_FOUND" },
      })
    ).toEqual({ status: "NOT_RECEIVED" });
    expect(
      await code(
        confirm({ actor: manager, donationId: withRef.donationId, input: {} })
      )
    ).toBe("DONATION_ALREADY_DECIDED");
    expect(
      await db.prisma.outboxEvent.count({
        where: { type: "donation.not-received" },
      })
    ).toBe(1);
  });

  it("shows the confirmation queue to a manager, and every status to someone who may view all", async () => {
    const id = await newCampaign();
    await setStatus(id, "ACTIVE");
    const open = await pledge(id);
    const cancelled = await pledge(id);
    await createCancelPledge(deps())({
      actor: donor,
      donationId: cancelled.donationId,
    });
    const list = createListDonationsForAdmin(deps());

    const queue = await list({ actor: manager, status: "CANCELLED" });
    expect(queue).toMatchObject({ status: "PLEDGED", viewAll: false });
    expect(queue.rows.map((r) => r.id)).toEqual([open.donationId]);
    expect(queue.rows[0]!.donor).toMatchObject({ name: "donor" });

    viewAll = true;
    const all = await list({ actor: manager, status: "bogus" });
    expect(all).toMatchObject({ status: null, viewAll: true });
    expect(all.rows).toHaveLength(2);
    const cancelledOnly = await list({ actor: manager, status: "CANCELLED" });
    expect(cancelledOnly.rows.map((r) => r.id)).toEqual([cancelled.donationId]);
  });

  it("edits a draft or active campaign, never a closed one, and guards each status change", async () => {
    const id = await newCampaign({ goal: "" });
    const edit = createEditCampaign(deps());
    await edit({
      actor: manager,
      campaignId: id,
      input: { ...fields, title: "Library fund 2026" },
    });
    expect(
      (await createListCampaignsForAdmin(deps())({ actor: manager })).map(
        (c) => [c.title, c.status]
      )
    ).toEqual([["Library fund 2026", "DRAFT"]]);
    expect(
      await code(edit({ actor: manager, campaignId: id, input: { title: "" } }))
    ).toBe("VALIDATION_FAILED");
    expect(
      await code(edit({ actor: manager, campaignId: MISSING, input: fields }))
    ).toBe("NOT_FOUND");

    expect(await code(setStatus(id, "DRAFT"))).toBe(
      "INVALID_CAMPAIGN_TRANSITION"
    );
    expect(await code(setStatus(id, "CLOSED"))).toBe(
      "INVALID_CAMPAIGN_TRANSITION"
    );
    expect(await code(setStatus(MISSING, "ACTIVE"))).toBe("NOT_FOUND");

    const ended = await newCampaign({
      startsOn: "2026-09-01",
      endsOn: "2026-09-30",
    });
    expect(await code(setStatus(ended, "ACTIVE"))).toBe(
      "INVALID_CAMPAIGN_TRANSITION"
    );

    await setStatus(id, "ACTIVE");
    await setStatus(id, "CLOSED");
    expect(
      await code(edit({ actor: manager, campaignId: id, input: fields }))
    ).toBe("INVALID_CAMPAIGN_TRANSITION");
  });
});
