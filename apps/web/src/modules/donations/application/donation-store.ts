import type { Permission } from "@nitap/database/permissions";

import type { Actor, Resource } from "@/modules/auth";

import type {
  Campaign,
  CampaignInput,
  CampaignStatus,
  CampaignWithProgress,
  Donation,
  DonationStatus,
  DonationWithDonor,
} from "../domain/donation";

export type Authorize = (
  actor: Actor | null,
  permission: Permission,
  resource?: Resource
) => Actor;
export type Can = (actor: Actor, permission: Permission) => boolean;

/** Ids only (`@nitap/jobs` DonationEventPayload). */
export type DonationEvent = {
  type: "donation.pledged" | "donation.confirmed" | "donation.not-received";
  payload: { v: 1; donationId: string; campaignId: string; donorId: string };
};

/**; identifiers and codes only (audit writer contract). */
export type DonationAuditEntry =
  | {
      action: "campaign.changed";
      actorId: string;
      targetType: "donation_campaign";
      targetId: string;
      metadata: {
        change: "created" | "edited" | "activated" | "closed";
      };
    }
  | {
      action: "donation.status_changed";
      actorId: string;
      targetType: "donation";
      targetId: string;
      metadata: {
        campaignId: string;
        from: DonationStatus;
        to: DonationStatus;
        reason?: string;
      };
    };

export type LockedDonation = {
  id: string;
  campaignId: string;
  donorId: string;
  status: DonationStatus;
  paymentReference: string | null;
};

/** One transaction per write: the row, its audit and its outbox event commit together. */
export type DonationTx = {
  /** Read under FOR SHARE, so a concurrent close waits for a pledge in flight (and vice versa). */
  findCampaign(id: string): Promise<Campaign | null>;
  findCampaignForUpdate(id: string): Promise<Campaign | null>;
  insertCampaign(input: CampaignInput, createdBy: string): Promise<string>;
  updateCampaign(id: string, input: CampaignInput): Promise<void>;
  setCampaignStatus(id: string, to: CampaignStatus): Promise<void>;
  /** Throws ConflictError(PAYMENT_REFERENCE_TAKEN) on a reference already used in the campaign. */
  insertDonation(input: {
    campaignId: string;
    donorId: string;
    amountPaise: number;
    paymentReference: string | null;
  }): Promise<string>;
  findDonationForUpdate(id: string): Promise<LockedDonation | null>;
  /** Same reference rule as insertDonation. */
  updateDonation(
    id: string,
    patch: {
      status?: DonationStatus;
      paymentReference?: string | null;
      decidedBy?: string;
      decidedAt?: Date;
      note?: string | null;
    }
  ): Promise<void>;
  audit(entry: DonationAuditEntry): Promise<void>;
  enqueue(event: DonationEvent): Promise<void>;
};

export type DonationStore = {
  transaction<T>(work: (tx: DonationTx) => Promise<T>): Promise<T>;
};

export type DonationQueries = {
  /** Campaigns in the given states with progress; ACTIVE ones soonest-ending first, then newest. */
  listCampaigns(
    statuses: readonly CampaignStatus[]
  ): Promise<CampaignWithProgress[]>;
  getCampaign(id: string): Promise<CampaignWithProgress | null>;
  /** The donor's own pledges, newest first. */
  listByDonor(donorId: string, take: number): Promise<Donation[]>;
  /** Newest first, optionally narrowed. */
  listDonations(filter: {
    status?: DonationStatus;
    campaignId?: string;
    take: number;
  }): Promise<DonationWithDonor[]>;
};
