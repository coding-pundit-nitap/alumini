import { PERMISSIONS } from "@nitap/database/permissions";

import { ConflictError, NotFoundError } from "@/lib/errors";
import type { Actor } from "@/modules/auth";

import {
  CAMPAIGN_TRANSITIONS,
  campaignInputSchema,
  istToday,
  type CampaignStatus,
  type CampaignWithProgress,
} from "../domain/donation";
import type {
  Authorize,
  DonationQueries,
  DonationStore,
} from "./donation-store";
import { toValidationError } from "./validation";

type Deps = {
  store: DonationStore;
  queries: DonationQueries;
  authorize: Authorize;
  now?: () => Date;
};

/** FR-DON-001, spec H-6. Every campaign, newest first, for `campaign.manage` holders. */
export function createListCampaignsForAdmin(deps: Deps) {
  return async function listCampaignsForAdmin(args: {
    actor: Actor | null;
  }): Promise<CampaignWithProgress[]> {
    deps.authorize(args.actor, PERMISSIONS.CAMPAIGN_MANAGE);
    return deps.queries.listCampaigns(["DRAFT", "ACTIVE", "CLOSED"]);
  };
}

/** A new campaign starts as DRAFT; audited `campaign.changed` (created). */
export function createCreateCampaign(deps: Deps) {
  return async function createCampaign(args: {
    actor: Actor | null;
    input: unknown;
  }): Promise<{ campaignId: string }> {
    const actor = deps.authorize(args.actor, PERMISSIONS.CAMPAIGN_MANAGE);
    const parsed = campaignInputSchema.safeParse(args.input);
    if (!parsed.success) throw toValidationError(parsed.error);
    return deps.store.transaction(async (tx) => {
      const campaignId = await tx.insertCampaign(parsed.data, actor.userId);
      await tx.audit({
        action: "campaign.changed",
        actorId: actor.userId,
        targetType: "donation_campaign",
        targetId: campaignId,
        metadata: { change: "created" },
      });
      return { campaignId };
    });
  };
}

/** Edit while DRAFT or ACTIVE; a CLOSED campaign is history (409). */
export function createEditCampaign(deps: Deps) {
  return async function editCampaign(args: {
    actor: Actor | null;
    campaignId: string;
    input: unknown;
  }): Promise<void> {
    const actor = deps.authorize(args.actor, PERMISSIONS.CAMPAIGN_MANAGE);
    const parsed = campaignInputSchema.safeParse(args.input);
    if (!parsed.success) throw toValidationError(parsed.error);
    await deps.store.transaction(async (tx) => {
      const campaign = await tx.findCampaignForUpdate(args.campaignId);
      if (!campaign) throw new NotFoundError();
      if (campaign.status === "CLOSED")
        throw new ConflictError("INVALID_CAMPAIGN_TRANSITION");
      await tx.updateCampaign(campaign.id, parsed.data);
      await tx.audit({
        action: "campaign.changed",
        actorId: actor.userId,
        targetType: "donation_campaign",
        targetId: campaign.id,
        metadata: { change: "edited" },
      });
    });
  };
}

/** DRAFT → ACTIVE (not after its end date) → CLOSED. Closing leaves open pledges confirmable (spec H-6). */
export function createChangeCampaignStatus(deps: Deps) {
  const now = deps.now ?? (() => new Date());
  return async function changeCampaignStatus(args: {
    actor: Actor | null;
    campaignId: string;
    to: unknown;
  }): Promise<{ status: CampaignStatus }> {
    const actor = deps.authorize(args.actor, PERMISSIONS.CAMPAIGN_MANAGE);
    const to = args.to;
    if (to !== "ACTIVE" && to !== "CLOSED")
      throw new ConflictError("INVALID_CAMPAIGN_TRANSITION");
    return deps.store.transaction(async (tx) => {
      const campaign = await tx.findCampaignForUpdate(args.campaignId);
      if (!campaign) throw new NotFoundError();
      if (!CAMPAIGN_TRANSITIONS[campaign.status].includes(to))
        throw new ConflictError("INVALID_CAMPAIGN_TRANSITION");
      if (to === "ACTIVE" && campaign.endsOn < istToday(now()))
        throw new ConflictError("INVALID_CAMPAIGN_TRANSITION", {
          message: "This campaign's end date has passed. Edit it first.",
        });
      await tx.setCampaignStatus(campaign.id, to);
      await tx.audit({
        action: "campaign.changed",
        actorId: actor.userId,
        targetType: "donation_campaign",
        targetId: campaign.id,
        metadata: { change: to === "ACTIVE" ? "activated" : "closed" },
      });
      return { status: to };
    });
  };
}
