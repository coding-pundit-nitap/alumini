"use client";

import type { ActionResult } from "@/lib/action-result";

import { ActionDialog } from "./action-dialog";

export type CampaignStatusAction = (
  campaignId: string,
  to: "ACTIVE" | "CLOSED"
) => Promise<ActionResult<unknown>>;

/**
 * Activate a draft, or close an active campaign (open pledges stay
 * confirmable).
 */
export function CampaignStatusButton(props: {
  campaignId: string;
  title: string;
  to: "ACTIVE" | "CLOSED";
  action: CampaignStatusAction;
}) {
  const activate = props.to === "ACTIVE";
  return (
    <ActionDialog
      trigger={activate ? "Activate" : "Close"}
      title={`${activate ? "Activate" : "Close"} “${props.title}”?`}
      description={
        activate
          ? "Members can pledge from its start date until its end date."
          : "Members can no longer pledge. Pledges already made can still be confirmed."
      }
      submitLabel={activate ? "Activate" : "Close campaign"}
      destructive={!activate}
      submit={() => props.action(props.campaignId, props.to)}
    />
  );
}
