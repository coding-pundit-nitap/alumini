"use server";

import { runAction } from "@/app/_actions/run-action";
import { confirmDonation, markNotReceived } from "@/composition/donations";
import type { ActionResult } from "@/lib/action-result";
import { NotFoundError } from "@/lib/errors";
import { getActor } from "@/modules/auth";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const id = (value: unknown) => {
  if (typeof value !== "string" || !UUID.test(value)) throw new NotFoundError();
  return value;
};

export async function confirmDonationAction(
  donationId: string,
  paymentReference: string
): Promise<ActionResult<unknown>> {
  return runAction(async () =>
    confirmDonation({
      actor: await getActor(),
      donationId: id(donationId),
      input: { paymentReference },
    })
  );
}

export async function markNotReceivedAction(
  donationId: string,
  reason: string
): Promise<ActionResult<unknown>> {
  return runAction(async () =>
    markNotReceived({
      actor: await getActor(),
      donationId: id(donationId),
      input: { reason },
    })
  );
}
