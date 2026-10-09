import { describe, expect, it, vi } from "vitest";
import { PERMISSIONS, type Permission } from "@nitap/database/permissions";

import {
  AuthenticationError,
  AuthorizationError,
  ConflictError,
  NotFoundError,
  ValidationError,
} from "@/lib/errors";
import type { Actor } from "@/modules/auth";

import type { Campaign, CampaignStatus } from "../domain/donation";
import { createChangeCampaignStatus, createEditCampaign } from "./campaigns";
import type {
  DonationQueries,
  DonationTx,
  LockedDonation,
} from "./donation-store";
import {
  createCancelPledge,
  createGetCampaign,
  createPledgeDonation,
  createSetPledgeReference,
} from "./member";
import {
  createConfirmDonation,
  createListDonationsForAdmin,
  createMarkNotReceived,
} from "./review";

const NOW = new Date("2026-10-10T06:00:00Z");
const actor = (userId = "manager"): Actor => ({
  userId,
  accountState: "VERIFIED",
  requestId: "r",
  grants: [],
});
const campaign = (status: CampaignStatus = "ACTIVE"): Campaign => ({
  id: "c1",
  title: "Library fund",
  description: "Books for the library",
  purpose: "Books",
  paymentInstructions: "UPI: library@bank",
  goalPaise: null,
  startsOn: "2026-10-01",
  endsOn: "2026-10-31",
  status,
  createdAt: NOW,
});
const pledge = (over: Partial<LockedDonation> = {}): LockedDonation => ({
  id: "d1",
  campaignId: "c1",
  donorId: "donor",
  status: "PLEDGED",
  paymentReference: null,
  ...over,
});

function setup(opts: {
  held?: Permission[];
  campaign?: Campaign | null;
  donation?: LockedDonation | null;
}) {
  const held = opts.held ?? [
    PERMISSIONS.DONATION_MAKE,
    PERMISSIONS.CAMPAIGN_MANAGE,
  ];
  const tx: DonationTx = {
    findCampaign: vi.fn(async () =>
      opts.campaign === undefined ? campaign() : opts.campaign
    ),
    findCampaignForUpdate: vi.fn(async () =>
      opts.campaign === undefined ? campaign() : opts.campaign
    ),
    insertCampaign: vi.fn(async () => "c-new"),
    updateCampaign: vi.fn(async () => {}),
    setCampaignStatus: vi.fn(async () => {}),
    insertDonation: vi.fn(async () => "d-new"),
    findDonationForUpdate: vi.fn(async () =>
      opts.donation === undefined ? pledge() : opts.donation
    ),
    updateDonation: vi.fn(async () => {}),
    audit: vi.fn(async () => {}),
    enqueue: vi.fn(async () => {}),
  };
  const queries: DonationQueries = {
    listCampaigns: vi.fn(async () => []),
    getCampaign: vi.fn(async () =>
      opts.campaign === null
        ? null
        : {
            ...(opts.campaign ?? campaign()),
            raisedPaise: 0,
            pledgedPaise: 0,
            donors: 0,
          }
    ),
    listByDonor: vi.fn(async () => []),
    listDonations: vi.fn(async () => []),
  };
  const authorize = vi.fn((a: Actor | null, p: Permission) => {
    if (!a) throw new AuthenticationError();
    if (!held.includes(p)) throw new AuthorizationError();
    return a;
  });
  const deps = {
    store: {
      transaction: <T>(work: (t: DonationTx) => Promise<T>) => work(tx),
    },
    queries,
    authorize,
    can: (_a: Actor, p: Permission) => held.includes(p),
    now: () => NOW,
  };
  return { tx, queries, deps };
}

describe("pledgeDonation", () => {
  it("writes a PLEDGED row and donation.pledged, ids only", async () => {
    const { tx, deps } = setup({});
    const result = await createPledgeDonation(deps)({
      actor: actor("donor"),
      campaignId: "c1",
      input: { amount: "2,000", paymentReference: "utr-1234" },
    });
    expect(result).toEqual({ donationId: "d-new" });
    expect(tx.insertDonation).toHaveBeenCalledWith({
      campaignId: "c1",
      donorId: "donor",
      amountPaise: 200_000,
      paymentReference: "UTR-1234",
    });
    expect(tx.enqueue).toHaveBeenCalledWith({
      type: "donation.pledged",
      payload: {
        v: 1,
        donationId: "d-new",
        campaignId: "c1",
        donorId: "donor",
      },
    });
  });

  it("404s a draft and 409s a closed or out-of-dates campaign", async () => {
    const draft = setup({ campaign: campaign("DRAFT") });
    await expect(
      createPledgeDonation(draft.deps)({
        actor: actor("donor"),
        campaignId: "c1",
        input: { amount: "100" },
      })
    ).rejects.toBeInstanceOf(NotFoundError);

    const closed = setup({ campaign: campaign("CLOSED") });
    await expect(
      createPledgeDonation(closed.deps)({
        actor: actor("donor"),
        campaignId: "c1",
        input: { amount: "100" },
      })
    ).rejects.toMatchObject({ code: "CAMPAIGN_NOT_OPEN" });
    expect(closed.tx.insertDonation).not.toHaveBeenCalled();
  });

  it("403s without donation.make", async () => {
    const { deps } = setup({ held: [] });
    await expect(
      createPledgeDonation(deps)({
        actor: actor("donor"),
        campaignId: "c1",
        input: { amount: "100" },
      })
    ).rejects.toBeInstanceOf(AuthorizationError);
  });
});

describe("the donor's own open pledge", () => {
  it("someone else's pledge is not found", async () => {
    const { deps, tx } = setup({});
    await expect(
      createCancelPledge(deps)({ actor: actor("other"), donationId: "d1" })
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(tx.updateDonation).not.toHaveBeenCalled();
  });

  it("a settled pledge can't be changed", async () => {
    const { deps } = setup({ donation: pledge({ status: "CONFIRMED" }) });
    await expect(
      createSetPledgeReference(deps)({
        actor: actor("donor"),
        donationId: "d1",
        input: { paymentReference: "UTR9999" },
      })
    ).rejects.toMatchObject({ code: "DONATION_ALREADY_DECIDED" });
  });

  it("cancels quietly: no audit, no notification", async () => {
    const { deps, tx } = setup({});
    await createCancelPledge(deps)({ actor: actor("donor"), donationId: "d1" });
    expect(tx.updateDonation).toHaveBeenCalledWith("d1", {
      status: "CANCELLED",
    });
    expect(tx.audit).not.toHaveBeenCalled();
    expect(tx.enqueue).not.toHaveBeenCalled();
  });
});

describe("getCampaign", () => {
  it("hides a draft from members", async () => {
    const { deps } = setup({ campaign: campaign("DRAFT") });
    await expect(
      createGetCampaign(deps)({ actor: actor("donor"), campaignId: "c1" })
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("confirmDonation", () => {
  it("confirms with the donor's reference, audits and notifies", async () => {
    const { deps, tx } = setup({
      donation: pledge({ paymentReference: "UTR1234" }),
    });
    await createConfirmDonation(deps)({
      actor: actor(),
      donationId: "d1",
      input: {},
    });
    expect(tx.updateDonation).toHaveBeenCalledWith("d1", {
      status: "CONFIRMED",
      paymentReference: "UTR1234",
      decidedBy: "manager",
      decidedAt: NOW,
    });
    expect(tx.audit).toHaveBeenCalledWith({
      action: "donation.status_changed",
      actorId: "manager",
      targetType: "donation",
      targetId: "d1",
      metadata: { campaignId: "c1", from: "PLEDGED", to: "CONFIRMED" },
    });
    expect(tx.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ type: "donation.confirmed" })
    );
  });

  it("needs a reference from somewhere", async () => {
    const { deps, tx } = setup({});
    await expect(
      createConfirmDonation(deps)({
        actor: actor(),
        donationId: "d1",
        input: {},
      })
    ).rejects.toBeInstanceOf(ValidationError);
    expect(tx.updateDonation).not.toHaveBeenCalled();
  });

  it("refuses a second decision with 409 and writes nothing", async () => {
    const { deps, tx } = setup({ donation: pledge({ status: "CONFIRMED" }) });
    await expect(
      createConfirmDonation(deps)({
        actor: actor(),
        donationId: "d1",
        input: { paymentReference: "UTR1234" },
      })
    ).rejects.toBeInstanceOf(ConflictError);
    expect(tx.audit).not.toHaveBeenCalled();
  });

  it("a manager can't settle their own pledge", async () => {
    const { deps } = setup({ donation: pledge({ donorId: "manager" }) });
    await expect(
      createMarkNotReceived(deps)({
        actor: actor(),
        donationId: "d1",
        input: { reason: "OTHER" },
      })
    ).rejects.toMatchObject({ code: "DONATION_SELF_DECISION", status: 403 });
  });
});

describe("listDonationsForAdmin", () => {
  it("campaign.manage alone sees only open pledges, whatever the filter", async () => {
    const { deps, queries } = setup({ held: [PERMISSIONS.CAMPAIGN_MANAGE] });
    const r = await createListDonationsForAdmin(deps)({
      actor: actor(),
      status: "CONFIRMED",
    });
    expect(r).toMatchObject({ status: "PLEDGED", viewAll: false });
    expect(queries.listDonations).toHaveBeenCalledWith({
      status: "PLEDGED",
      take: 200,
    });
  });

  it("donation.view_all filters freely; an unknown status means all", async () => {
    const { deps, queries } = setup({
      held: [PERMISSIONS.DONATION_VIEW_ALL],
    });
    expect(
      (await createListDonationsForAdmin(deps)({ actor: actor(), status: "x" }))
        .status
    ).toBeNull();
    expect(queries.listDonations).toHaveBeenCalledWith({
      status: undefined,
      take: 200,
    });
  });
});

describe("campaign lifecycle", () => {
  it("activates a draft and audits it; refuses CLOSED → ACTIVE", async () => {
    const { deps, tx } = setup({ campaign: campaign("DRAFT") });
    await createChangeCampaignStatus(deps)({
      actor: actor(),
      campaignId: "c1",
      to: "ACTIVE",
    });
    expect(tx.setCampaignStatus).toHaveBeenCalledWith("c1", "ACTIVE");
    expect(tx.audit).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: { change: "activated" } })
    );

    const closed = setup({ campaign: campaign("CLOSED") });
    await expect(
      createChangeCampaignStatus(closed.deps)({
        actor: actor(),
        campaignId: "c1",
        to: "ACTIVE",
      })
    ).rejects.toMatchObject({ code: "INVALID_CAMPAIGN_TRANSITION" });
  });

  it("won't activate a campaign whose end date has passed", async () => {
    const { deps } = setup({
      campaign: { ...campaign("DRAFT"), endsOn: "2026-10-09" },
    });
    await expect(
      createChangeCampaignStatus(deps)({
        actor: actor(),
        campaignId: "c1",
        to: "ACTIVE",
      })
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("a closed campaign can't be edited", async () => {
    const { deps } = setup({ campaign: campaign("CLOSED") });
    await expect(
      createEditCampaign(deps)({
        actor: actor(),
        campaignId: "c1",
        input: {
          title: "Library fund",
          description: "Books for the library",
          purpose: "Books",
          paymentInstructions: "UPI: library@bank",
          startsOn: "2026-10-01",
          endsOn: "2026-10-31",
        },
      })
    ).rejects.toBeInstanceOf(ConflictError);
  });
});
