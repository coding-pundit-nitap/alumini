import { Badge } from "@nitap/ui/components/badge";

import { formatPaise, type CampaignWithProgress } from "../../domain/donation";
import { CAMPAIGN_STATUS_LABEL, formatDay } from "../labels";
import { CampaignDialog, type SaveCampaignAction } from "./campaign-dialog";
import {
  CampaignStatusButton,
  type CampaignStatusAction,
} from "./campaign-status-button";

/**
 * `/admin/campaigns`: every campaign, its progress and the actions its state
 * allows.
 */
export function CampaignsTable(props: {
  campaigns: readonly CampaignWithProgress[];
  save: SaveCampaignAction;
  changeStatus: CampaignStatusAction;
}) {
  if (props.campaigns.length === 0)
    return (
      <p className="text-muted-foreground p-6 text-center text-sm">
        No campaigns yet.
      </p>
    );
  return (
    <table className="w-full text-sm">
      <thead className="text-muted-foreground text-left text-xs">
        <tr className="border-b">
          <th scope="col" className="px-4 py-2 font-medium">
            Campaign
          </th>
          <th scope="col" className="px-4 py-2 font-medium">
            Dates
          </th>
          <th scope="col" className="px-4 py-2 text-right font-medium">
            Received
          </th>
          <th scope="col" className="px-4 py-2 text-right font-medium">
            Pledged
          </th>
          <th scope="col" className="px-4 py-2">
            <span className="sr-only">Actions</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {props.campaigns.map((c) => (
          <tr key={c.id} className="border-b last:border-0">
            <th scope="row" className="px-4 py-3 text-left font-normal">
              <span className="font-medium">{c.title}</span>{" "}
              <Badge variant="outline">{CAMPAIGN_STATUS_LABEL[c.status]}</Badge>
              <span className="text-muted-foreground block text-xs">
                {c.purpose}
              </span>
            </th>
            <td className="text-muted-foreground px-4 py-3 text-xs">
              {formatDay(c.startsOn)} – {formatDay(c.endsOn)}
            </td>
            <td className="px-4 py-3 text-right tabular-nums">
              {formatPaise(c.raisedPaise)}
              {c.goalPaise ? (
                <span className="text-muted-foreground block text-xs">
                  of {formatPaise(c.goalPaise)}
                </span>
              ) : null}
            </td>
            <td className="px-4 py-3 text-right tabular-nums">
              {formatPaise(c.pledgedPaise)}
            </td>
            <td className="px-4 py-3">
              <div className="flex flex-wrap justify-end gap-2">
                {c.status !== "CLOSED" ? (
                  <CampaignDialog campaign={c} action={props.save} />
                ) : null}
                {c.status === "DRAFT" ? (
                  <CampaignStatusButton
                    campaignId={c.id}
                    title={c.title}
                    to="ACTIVE"
                    action={props.changeStatus}
                  />
                ) : null}
                {c.status === "ACTIVE" ? (
                  <CampaignStatusButton
                    campaignId={c.id}
                    title={c.title}
                    to="CLOSED"
                    action={props.changeStatus}
                  />
                ) : null}
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
