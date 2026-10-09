"use server";

import { runAction } from "@/app/_actions/run-action";
import {
  cancelPledge,
  pledgeDonation,
  setPledgeReference,
} from "@/composition/donations";
import type { ActionResult } from "@/lib/action-result";
import { NotFoundError } from "@/lib/errors";
import { getActor } from "@/modules/auth";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** A malformed id would reach a `::uuid` cast and fail as a 500; it is simply not found. */
const id = (value: unknown) => {
  if (typeof value !== "string" || !UUID.test(value)) throw new NotFoundError();
  return value;
};

export async function pledgeAction(
  campaignId: string,
  input: { amount: string; paymentReference: string }
): Promise<ActionResult<{ donationId: string }>> {
  return runAction(async () =>
    pledgeDonation({
      actor: await getActor(),
      campaignId: id(campaignId),
      input: {
        amount: input?.amount,
        paymentReference: input?.paymentReference,
      },
    })
  );
}

export async function setReferenceAction(
  donationId: string,
  paymentReference: string
): Promise<ActionResult<unknown>> {
  return runAction(async () =>
    setPledgeReference({
      actor: await getActor(),
      donationId: id(donationId),
      input: { paymentReference },
    })
  );
}

export async function cancelPledgeAction(
  donationId: string
): Promise<ActionResult<unknown>> {
  return runAction(async () =>
    cancelPledge({ actor: await getActor(), donationId: id(donationId) })
  );
}
