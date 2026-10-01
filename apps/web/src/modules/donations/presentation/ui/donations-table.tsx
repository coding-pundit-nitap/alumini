import { Badge } from "@nitap/ui/components/badge";

import { formatPaise, type DonationWithDonor } from "../../domain/donation";
import { DONATION_STATUS_LABEL } from "../labels";
import {
  DecidePledge,
  type ConfirmAction,
  type NotReceivedAction,
} from "./decide-pledge";

const dateFormat = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeZone: "Asia/Kolkata",
});

/** `/admin/donations`: open pledges carry their decision buttons when the viewer may decide (spec H-3). */
export function DonationsTable(props: {
  rows: readonly DonationWithDonor[];
  canDecide: boolean;
  confirm: ConfirmAction;
  notReceived: NotReceivedAction;
}) {
  if (props.rows.length === 0)
    return (
      <p className="text-muted-foreground p-6 text-center text-sm">
        Nothing here.
      </p>
    );
  return (
    <table className="w-full text-sm">
      <thead className="text-muted-foreground text-left text-xs">
        <tr className="border-b">
          <th scope="col" className="px-4 py-2 font-medium">
            Donor
          </th>
          <th scope="col" className="px-4 py-2 font-medium">
            Campaign
          </th>
          <th scope="col" className="px-4 py-2 text-right font-medium">
            Amount
          </th>
          <th scope="col" className="px-4 py-2 font-medium">
            Reference
          </th>
          <th scope="col" className="px-4 py-2 font-medium">
            Status
          </th>
          <th scope="col" className="px-4 py-2">
            <span className="sr-only">Actions</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {props.rows.map((d) => (
          <tr key={d.id} className="border-b last:border-0">
            <th scope="row" className="px-4 py-3 text-left font-normal">
              <span className="font-medium">{d.donor.name}</span>
              <span className="text-muted-foreground block text-xs">
                {d.donor.email} · {dateFormat.format(d.createdAt)}
              </span>
            </th>
            <td className="px-4 py-3">{d.campaignTitle}</td>
            <td className="px-4 py-3 text-right tabular-nums">
              {formatPaise(d.amountPaise)}
            </td>
            <td className="px-4 py-3 font-mono text-xs">
              {d.paymentReference ?? "—"}
            </td>
            <td className="px-4 py-3">
              <Badge variant={d.status === "CONFIRMED" ? "default" : "outline"}>
                {DONATION_STATUS_LABEL[d.status]}
              </Badge>
            </td>
            <td className="px-4 py-3">
              {props.canDecide && d.status === "PLEDGED" ? (
                <DecidePledge
                  donation={d}
                  confirm={props.confirm}
                  notReceived={props.notReceived}
                />
              ) : null}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
