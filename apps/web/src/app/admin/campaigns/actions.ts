"use server";

import { runAction } from "@/app/_actions/run-action";
import {
  changeCampaignStatus,
  createCampaign,
  editCampaign,
} from "@/composition/donations";
import type { ActionResult } from "@/lib/action-result";
import { NotFoundError } from "@/lib/errors";
import { getActor } from "@/modules/auth";
import type { CampaignFields } from "@/modules/donations";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const id = (value: unknown) => {
  if (typeof value !== "string" || !UUID.test(value)) throw new NotFoundError();
  return value;
};
/** Only the named fields reach the strict schema. */
const pick = (v: CampaignFields) => ({
  title: v?.title,
  description: v?.description,
  purpose: v?.purpose,
  paymentInstructions: v?.paymentInstructions,
  goal: v?.goal,
  startsOn: v?.startsOn,
  endsOn: v?.endsOn,
});

export async function saveCampaignAction(
  campaignId: string | null,
  input: CampaignFields
): Promise<ActionResult<unknown>> {
  return runAction(async () => {
    const actor = await getActor();
    if (campaignId === null)
      return createCampaign({ actor, input: pick(input) });
    return editCampaign({
      actor,
      campaignId: id(campaignId),
      input: pick(input),
    });
  });
}

export async function changeCampaignStatusAction(
  campaignId: string,
  to: "ACTIVE" | "CLOSED"
): Promise<ActionResult<unknown>> {
  return runAction(async () =>
    changeCampaignStatus({
      actor: await getActor(),
      campaignId: id(campaignId),
      to,
    })
  );
}
