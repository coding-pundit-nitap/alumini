import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createAuditWriter } from "@nitap/database/audit";
import { createPledgeExpiryStore } from "@nitap/database/donations";
import { createOutboxWriter } from "@nitap/database/outbox";
import { runSeed } from "@nitap/database/seed";
import { createTestDatabase, type TestDatabase } from "@nitap/testing";

import { createTransactionRunner } from "@/infrastructure/database/transaction-runner";
import type { Actor } from "@/modules/auth";
import { createPrismaAnalyticsStore } from "@/modules/admin/server";
import { analyticsWindow } from "@/modules/admin/domain/analytics";
import {
  createChangeCampaignStatus,
  createConfirmDonation,
  createCreateCampaign,
  createListOpenCampaigns,
  createMarkNotReceived,
  createPledgeDonation,
} from "@/modules/donations";
import {
  createPrismaDonationQueries,
  createPrismaDonationStore,
} from "@/modules/donations/server";

const NOW = new Date("2026-10-10T06:00:00Z");
const DAY = 86_400_000;

describe("donations (12H) against PostgreSQL", () => {
  let db: TestDatabase;
  let manager: Actor;
  let otherManager: Actor;
  let donor: Actor;
  let campaignId: string;

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
    can: () => false,
    now: () => NOW,
  });
  const pledge = (amount: string, paymentReference?: string, who = donor) =>
    createPledgeDonation(deps())({
      actor: who,
      campaignId,
      input: { amount, paymentReference },
    });

  beforeEach(async () => {
    db = await createTestDatabase();
    await runSeed(db.prisma);
    manager = await actorFor("manager");
    otherManager = await actorFor("manager2");
    donor = await actorFor("donor");
    ({ campaignId } = await createCreateCampaign(deps())({
      actor: manager,
      input: {
        title: "Library fund",
        description: "Books for the central library",
        purpose: "Books",
        paymentInstructions: "UPI: library@bank",
        goal: "10,000",
        startsOn: "2026-10-01",
        endsOn: "2026-10-31",
      },
    }));
    await createChangeCampaignStatus(deps())({
      actor: manager,
      campaignId,
      to: "ACTIVE",
    });
  });
  afterEach(() => db.drop());

  it("a pledge writes its outbox event; progress counts confirmed money only", async () => {
    const a = await pledge("2,500", "utr-1111");
    await pledge("1,000");
    expect(
      await db.prisma.outboxEvent.count({
        where: { type: "donation.pledged" },
      })
    ).toBe(2);

    await createConfirmDonation(deps())({
      actor: manager,
      donationId: a.donationId,
      input: {},
    });
    const { open } = await createListOpenCampaigns(deps())({ actor: donor });
    expect(open[0]).toMatchObject({
      raisedPaise: 250_000,
      pledgedPaise: 100_000,
      donors: 1,
      goalPaise: 1_000_000,
    });
  });

  it("the same bank reference can't settle two pledges in a campaign (FR-DON-004)", async () => {
    await pledge("100", "UTR-2222");
    await expect(pledge("200", "utr-2222")).rejects.toMatchObject({
      code: "PAYMENT_REFERENCE_TAKEN",
    });
    const open = await pledge("300");
    await expect(
      createConfirmDonation(deps())({
        actor: manager,
        donationId: open.donationId,
        input: { paymentReference: "utr-2222" },
      })
    ).rejects.toMatchObject({ code: "PAYMENT_REFERENCE_TAKEN" });
    expect(
      (
        await db.prisma.donation.findUniqueOrThrow({
          where: { id: open.donationId },
        })
      ).status
    ).toBe("PLEDGED");
  });

  it("two managers deciding at once: one wins, the other gets 409, one audit row", async () => {
    const { donationId } = await pledge("500", "UTR-3333");
    const results = await Promise.allSettled([
      createConfirmDonation(deps())({
        actor: manager,
        donationId,
        input: {},
      }),
      createMarkNotReceived(deps())({
        actor: otherManager,
        donationId,
        input: { reason: "NO_PAYMENT_FOUND" },
      }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((r) => r.status === "rejected");
    expect((rejected as PromiseRejectedResult).reason).toMatchObject({
      code: "DONATION_ALREADY_DECIDED",
    });
    expect(
      await db.prisma.auditLog.count({
        where: { action: "donation.status_changed", targetId: donationId },
      })
    ).toBe(1);
  });

  it("the database refuses a confirmation with no manager or reference", async () => {
    const { donationId } = await pledge("500");
    await expect(
      db.prisma.donation.update({
        where: { id: donationId },
        data: { status: "CONFIRMED", decidedAt: NOW },
      })
    ).rejects.toThrow(/ck_donation_confirmed/);
  });

  it("the expiry sweep closes stale pledges without a reference, once", async () => {
    const stale = await pledge("100");
    const withRef = await pledge("100", "UTR-4444");
    const old = new Date(NOW.getTime() - 31 * DAY);
    await db.prisma.donation.updateMany({
      where: { id: { in: [stale.donationId, withRef.donationId] } },
      data: { createdAt: old },
    });
    const store = createPledgeExpiryStore({
      prisma: db.prisma,
      outbox: createOutboxWriter(),
    });
    const before = new Date(NOW.getTime() - 30 * DAY);
    expect(await store.listStale(before, 10)).toEqual([
      { id: stale.donationId },
    ]);
    expect(await store.expireOne(stale.donationId, before, NOW)).toBe(true);
    expect(await store.expireOne(stale.donationId, before, NOW)).toBe(false);
    expect(
      await db.prisma.donation.findUniqueOrThrow({
        where: { id: stale.donationId },
      })
    ).toMatchObject({
      status: "NOT_RECEIVED",
      note: "expired",
      decidedBy: null,
    });
    expect(
      await db.prisma.outboxEvent.count({
        where: { type: "donation.not-received" },
      })
    ).toBe(1);
  });

  it("analytics: confirmed money per IST week, donors, and the per-campaign donor bucket", async () => {
    const { donationId } = await pledge("1,234.56", "UTR-5555");
    await createConfirmDonation(deps())({
      actor: manager,
      donationId,
      input: {},
    });
    const raw = await createPrismaAnalyticsStore(db.prisma).donationsSection(
      analyticsWindow("30d", new Date(NOW.getTime() + DAY))
    );
    expect(raw.raisedPaise).toBe(123_456);
    expect(raw.donors).toBe(1);
    expect(raw.receivedRupees).toHaveLength(1);
    expect(raw.receivedRupees[0]!.value).toBe(1_235); // whole rupees, rounded
    expect(raw.donorsByCampaign).toEqual([{ key: "Library fund", value: 1 }]);
  });
});
