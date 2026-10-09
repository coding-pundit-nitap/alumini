import { PERMISSIONS } from "@nitap/database/permissions";

import {
  AuthorizationError,
  ConflictError,
  NotFoundError,
  ValidationError,
} from "@/lib/errors";
import type { Actor } from "@/modules/auth";

import {
  confirmInputSchema,
  DONATION_STATUSES,
  notReceivedInputSchema,
  type DonationStatus,
  type DonationWithDonor,
} from "../domain/donation";
import type {
  Authorize,
  Can,
  DonationQueries,
  DonationStore,
  DonationTx,
} from "./donation-store";
import { toValidationError } from "./validation";

type Deps = {
  store: DonationStore;
  queries: DonationQueries;
  authorize: Authorize;
  can: Can;
  now?: () => Date;
};

const isStatus = (v: unknown): v is DonationStatus =>
  DONATION_STATUSES.includes(v as DonationStatus);

/** `donation.view_all` sees every pledge; `campaign.manage` alone sees only open pledges to confirm. */
export function createListDonationsForAdmin(deps: Deps) {
  return async function listDonationsForAdmin(args: {
    actor: Actor | null;
    status?: unknown;
  }): Promise<{
    rows: DonationWithDonor[];
    status: DonationStatus | null;
    viewAll: boolean;
  }> {
    const viewAll =
      args.actor !== null &&
      deps.can(args.actor, PERMISSIONS.DONATION_VIEW_ALL);
    if (!viewAll) deps.authorize(args.actor, PERMISSIONS.CAMPAIGN_MANAGE);
    const status: DonationStatus | null = viewAll
      ? isStatus(args.status)
        ? args.status
        : null
      : "PLEDGED";
    const rows = await deps.queries.listDonations({
      status: status ?? undefined,
      take: 200,
    });
    return { rows, status, viewAll };
  };
}

/** Locks the pledge, refuses a second decision and a manager settling their own pledge. */
async function openPledgeToDecide(tx: DonationTx, actor: Actor, id: string) {
  const row = await tx.findDonationForUpdate(id);
  if (!row) throw new NotFoundError();
  if (row.status !== "PLEDGED")
    throw new ConflictError("DONATION_ALREADY_DECIDED");
  if (row.donorId === actor.userId)
    throw new AuthorizationError({ code: "DONATION_SELF_DECISION" });
  return row;
}

/** The per-campaign unique payment reference is the idempotency key. */
export function createConfirmDonation(deps: Deps) {
  const now = deps.now ?? (() => new Date());
  return async function confirmDonation(args: {
    actor: Actor | null;
    donationId: string;
    input: unknown;
  }): Promise<{ status: "CONFIRMED" }> {
    const actor = deps.authorize(args.actor, PERMISSIONS.CAMPAIGN_MANAGE);
    const parsed = confirmInputSchema.safeParse(args.input);
    if (!parsed.success) throw toValidationError(parsed.error);
    return deps.store.transaction(async (tx) => {
      const row = await openPledgeToDecide(tx, actor, args.donationId);
      const reference = parsed.data.paymentReference ?? row.paymentReference;
      if (!reference)
        throw new ValidationError({
          details: [
            {
              field: "paymentReference",
              code: "INVALID",
              message: "Enter the payment reference from the bank statement.",
            },
          ],
        });
      await tx.updateDonation(row.id, {
        status: "CONFIRMED",
        paymentReference: reference,
        decidedBy: actor.userId,
        decidedAt: now(),
      });
      await tx.audit({
        action: "donation.status_changed",
        actorId: actor.userId,
        targetType: "donation",
        targetId: row.id,
        metadata: {
          campaignId: row.campaignId,
          from: "PLEDGED",
          to: "CONFIRMED",
        },
      });
      await tx.enqueue({
        type: "donation.confirmed",
        payload: {
          v: 1,
          donationId: row.id,
          campaignId: row.campaignId,
          donorId: row.donorId,
        },
      });
      return { status: "CONFIRMED" as const };
    });
  };
}

/** PLEDGED → NOT_RECEIVED with a reason code; the donor is told. */
export function createMarkNotReceived(deps: Deps) {
  const now = deps.now ?? (() => new Date());
  return async function markNotReceived(args: {
    actor: Actor | null;
    donationId: string;
    input: unknown;
  }): Promise<{ status: "NOT_RECEIVED" }> {
    const actor = deps.authorize(args.actor, PERMISSIONS.CAMPAIGN_MANAGE);
    const parsed = notReceivedInputSchema.safeParse(args.input);
    if (!parsed.success) throw toValidationError(parsed.error);
    return deps.store.transaction(async (tx) => {
      const row = await openPledgeToDecide(tx, actor, args.donationId);
      await tx.updateDonation(row.id, {
        status: "NOT_RECEIVED",
        decidedBy: actor.userId,
        decidedAt: now(),
        note: parsed.data.reason,
      });
      await tx.audit({
        action: "donation.status_changed",
        actorId: actor.userId,
        targetType: "donation",
        targetId: row.id,
        metadata: {
          campaignId: row.campaignId,
          from: "PLEDGED",
          to: "NOT_RECEIVED",
          reason: parsed.data.reason,
        },
      });
      await tx.enqueue({
        type: "donation.not-received",
        payload: {
          v: 1,
          donationId: row.id,
          campaignId: row.campaignId,
          donorId: row.donorId,
        },
      });
      return { status: "NOT_RECEIVED" as const };
    });
  };
}
