"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";

import { Badge } from "@nitap/ui/components/badge";
import { Button } from "@nitap/ui/components/button";
import { Input } from "@nitap/ui/components/input";

import type { ActionResult } from "@/lib/action-result";

import { formatPaise, type Donation } from "../../domain/donation";
import { DONATION_STATUS_LABEL, NOT_RECEIVED_LABEL } from "../labels";
import { useDonationAction } from "./use-donation-action";

export type ReferenceAction = (
  donationId: string,
  paymentReference: string
) => Promise<ActionResult<unknown>>;
export type CancelAction = (
  donationId: string
) => Promise<ActionResult<unknown>>;

const dateFormat = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeZone: "Asia/Kolkata",
});

function OpenPledgeActions(props: {
  donation: Donation;
  setReference: ReferenceAction;
  cancel: CancelAction;
}) {
  const router = useRouter();
  const inputId = useId();
  const [reference, setReference] = useState(
    props.donation.paymentReference ?? ""
  );
  const { pending, error, run } = useDonationAction();
  return (
    <div className="flex flex-col gap-2">
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          run(
            () => props.setReference(props.donation.id, reference),
            () => router.refresh()
          );
        }}
      >
        <div className="flex min-w-48 flex-1 flex-col gap-1">
          <label htmlFor={inputId} className="text-xs font-medium">
            Payment reference
          </label>
          <Input
            id={inputId}
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder="UTR or cheque number"
            autoComplete="off"
          />
        </div>
        <Button
          type="submit"
          size="sm"
          variant="outline"
          className="rounded-full"
          disabled={pending || reference.trim() === ""}
        >
          Save reference
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="text-destructive rounded-full"
          disabled={pending}
          onClick={() =>
            run(
              () => props.cancel(props.donation.id),
              () => router.refresh()
            )
          }
        >
          Cancel pledge
        </Button>
      </form>
      {error ? (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** `/donations`: each pledge and where it stands; open ones can take a reference or be withdrawn. */
export function MyDonations(props: {
  donations: readonly Donation[];
  setReference: ReferenceAction;
  cancel: CancelAction;
}) {
  if (props.donations.length === 0)
    return (
      <p className="text-muted-foreground p-6 text-center text-sm">
        You haven&apos;t pledged yet.{" "}
        <Link href="/donate" className="text-foreground underline">
          See open campaigns
        </Link>
        .
      </p>
    );
  return (
    <ul className="divide-y">
      {props.donations.map((d) => (
        <li key={d.id} className="flex flex-col gap-3 p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <Link
                href={`/donate/${d.campaignId}`}
                className="font-medium hover:underline"
              >
                {d.campaignTitle}
              </Link>
              <p className="text-muted-foreground text-xs">
                Pledged {dateFormat.format(d.createdAt)}
                {d.paymentReference ? ` · Ref ${d.paymentReference}` : ""}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-semibold tabular-nums">
                {formatPaise(d.amountPaise)}
              </span>
              <Badge variant={d.status === "CONFIRMED" ? "default" : "outline"}>
                {DONATION_STATUS_LABEL[d.status]}
              </Badge>
            </div>
          </div>
          {d.status === "NOT_RECEIVED" && d.note ? (
            <p className="text-muted-foreground text-sm">
              {NOT_RECEIVED_LABEL[d.note as keyof typeof NOT_RECEIVED_LABEL] ??
                "Not received"}
            </p>
          ) : null}
          {d.status === "PLEDGED" ? (
            <OpenPledgeActions
              donation={d}
              setReference={props.setReference}
              cancel={props.cancel}
            />
          ) : null}
        </li>
      ))}
    </ul>
  );
}
