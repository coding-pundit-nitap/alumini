"use client";

import { useId, useState } from "react";

import { Input } from "@nitap/ui/components/input";

import type { ActionResult } from "@/lib/action-result";

import {
  formatPaise,
  NOT_RECEIVED_REASONS,
  type DonationWithDonor,
} from "../../domain/donation";
import { NOT_RECEIVED_LABEL } from "../labels";
import { ActionDialog } from "./action-dialog";

export type ConfirmAction = (
  donationId: string,
  paymentReference: string
) => Promise<ActionResult<unknown>>;
export type NotReceivedAction = (
  donationId: string,
  reason: string
) => Promise<ActionResult<unknown>>;

const SELECT_CLASS =
  "border-input bg-background h-9 w-full rounded-lg border px-2.5 text-sm";

/**
 * Confirm against the statement's reference (prefilled with the donor's), or
 * mark not received.
 */
export function DecidePledge(props: {
  donation: DonationWithDonor;
  confirm: ConfirmAction;
  notReceived: NotReceivedAction;
}) {
  const { donation: d } = props;
  const referenceId = useId();
  const reasonId = useId();
  const [reference, setReference] = useState(d.paymentReference ?? "");
  const [reason, setReason] = useState("");
  const summary = `${formatPaise(d.amountPaise)} from ${d.donor.name} to ${d.campaignTitle}`;

  return (
    <div className="flex flex-wrap justify-end gap-2">
      <ActionDialog
        trigger="Confirm"
        triggerVariant="default"
        title="Confirm receipt"
        description={`${summary}. Confirm only once this payment shows on the bank statement.`}
        submitLabel="Confirm received"
        ready={reference.trim() !== ""}
        submit={() => props.confirm(d.id, reference)}
        onClose={() => setReference(d.paymentReference ?? "")}
      >
        <div className="flex flex-col gap-1">
          <label htmlFor={referenceId} className="text-sm font-medium">
            Payment reference
          </label>
          <Input
            id={referenceId}
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            autoComplete="off"
          />
        </div>
      </ActionDialog>
      <ActionDialog
        trigger="Not received"
        title="Mark as not received"
        description={`${summary}. The donor is told.`}
        submitLabel="Mark not received"
        destructive
        ready={reason !== ""}
        submit={() => props.notReceived(d.id, reason)}
        onClose={() => setReason("")}
      >
        <div className="flex flex-col gap-1">
          <label htmlFor={reasonId} className="text-sm font-medium">
            Reason
          </label>
          <select
            id={reasonId}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className={SELECT_CLASS}
          >
            <option value="" disabled>
              Choose a reason
            </option>
            {NOT_RECEIVED_REASONS.map((r) => (
              <option key={r} value={r}>
                {NOT_RECEIVED_LABEL[r]}
              </option>
            ))}
          </select>
        </div>
      </ActionDialog>
    </div>
  );
}
