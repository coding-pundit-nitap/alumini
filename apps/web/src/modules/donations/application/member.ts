import { PERMISSIONS } from "@nitap/database/permissions";

import { ConflictError, NotFoundError } from "@/lib/errors";
import type { Actor } from "@/modules/auth";

import {
  acceptsPledges,
  pledgeInputSchema,
  referenceInputSchema,
  type CampaignWithProgress,
  type Donation,
} from "../domain/donation";
import type {
  Authorize,
  DonationQueries,
  DonationStore,
  DonationTx,
} from "./donation-store";
import { toValidationError } from "./validation";

type Deps = {
  store: DonationStore;
  queries: DonationQueries;
  authorize: Authorize;
  now?: () => Date;
};

/** `/donate`: campaigns a member can give to now, plus closed ones for their record (spec H-10). */
export function createListOpenCampaigns(deps: Deps) {
  const now = deps.now ?? (() => new Date());
  return async function listOpenCampaigns(args: {
    actor: Actor | null;
  }): Promise<{
    open: CampaignWithProgress[];
    closed: CampaignWithProgress[];
  }> {
    deps.authorize(args.actor, PERMISSIONS.DONATION_MAKE);
    const rows = await deps.queries.listCampaigns(["ACTIVE", "CLOSED"]);
    const at = now();
    return {
      open: rows.filter((c) => acceptsPledges(c, at)),
      closed: rows.filter((c) => c.status === "CLOSED"),
    };
  };
}

/** A DRAFT campaign does not exist for members (404). */
export function createGetCampaign(deps: Deps) {
  const now = deps.now ?? (() => new Date());
  return async function getCampaign(args: {
    actor: Actor | null;
    campaignId: string;
  }): Promise<{ campaign: CampaignWithProgress; acceptsPledges: boolean }> {
    deps.authorize(args.actor, PERMISSIONS.DONATION_MAKE);
    const campaign = await deps.queries.getCampaign(args.campaignId);
    if (!campaign || campaign.status === "DRAFT") throw new NotFoundError();
    return { campaign, acceptsPledges: acceptsPledges(campaign, now()) };
  };
}

/** FR-DON-002, spec H-5/H-7: a PLEDGED row and `donation.pledged`, in one transaction. */
export function createPledgeDonation(deps: Deps) {
  const now = deps.now ?? (() => new Date());
  return async function pledgeDonation(args: {
    actor: Actor | null;
    campaignId: string;
    input: unknown;
  }): Promise<{ donationId: string }> {
    const actor = deps.authorize(args.actor, PERMISSIONS.DONATION_MAKE);
    const parsed = pledgeInputSchema.safeParse(args.input);
    if (!parsed.success) throw toValidationError(parsed.error);
    return deps.store.transaction(async (tx) => {
      const campaign = await tx.findCampaign(args.campaignId);
      if (!campaign || campaign.status === "DRAFT") throw new NotFoundError();
      if (!acceptsPledges(campaign, now()))
        throw new ConflictError("CAMPAIGN_NOT_OPEN");
      const donationId = await tx.insertDonation({
        campaignId: campaign.id,
        donorId: actor.userId,
        amountPaise: parsed.data.amount,
        paymentReference: parsed.data.paymentReference,
      });
      await tx.enqueue({
        type: "donation.pledged",
        payload: {
          v: 1,
          donationId,
          campaignId: campaign.id,
          donorId: actor.userId,
        },
      });
      return { donationId };
    });
  };
}

/** The donor's own open pledge, locked; anyone else's is not found (it is not theirs to see). */
async function ownOpenPledge(tx: DonationTx, actor: Actor, id: string) {
  const row = await tx.findDonationForUpdate(id);
  if (!row || row.donorId !== actor.userId) throw new NotFoundError();
  if (row.status !== "PLEDGED")
    throw new ConflictError("DONATION_ALREADY_DECIDED");
  return row;
}

/** The donor adds or corrects their UTR / cheque number while the pledge is open. */
export function createSetPledgeReference(deps: Deps) {
  return async function setPledgeReference(args: {
    actor: Actor | null;
    donationId: string;
    input: unknown;
  }): Promise<{ paymentReference: string }> {
    const actor = deps.authorize(args.actor, PERMISSIONS.DONATION_MAKE);
    const parsed = referenceInputSchema.safeParse(args.input);
    if (!parsed.success) throw toValidationError(parsed.error);
    return deps.store.transaction(async (tx) => {
      const row = await ownOpenPledge(tx, actor, args.donationId);
      await tx.updateDonation(row.id, {
        paymentReference: parsed.data.paymentReference,
      });
      return { paymentReference: parsed.data.paymentReference };
    });
  };
}

/** The donor withdraws an open pledge. Nobody is notified: nothing was received. */
export function createCancelPledge(deps: Deps) {
  return async function cancelPledge(args: {
    actor: Actor | null;
    donationId: string;
  }): Promise<void> {
    const actor = deps.authorize(args.actor, PERMISSIONS.DONATION_MAKE);
    await deps.store.transaction(async (tx) => {
      const row = await ownOpenPledge(tx, actor, args.donationId);
      await tx.updateDonation(row.id, { status: "CANCELLED" });
    });
  };
}

/** `/donations`: the member's own pledges. A suspended account cannot reach this (403 from authorize). */
export function createListMyDonations(deps: Deps) {
  return async function listMyDonations(args: {
    actor: Actor | null;
  }): Promise<Donation[]> {
    const actor = deps.authorize(args.actor, PERMISSIONS.DONATION_MAKE);
    // ponytail: one page of 100; add a cursor if anyone ever pledges more than that.
    return deps.queries.listByDonor(actor.userId, 100);
  };
}
