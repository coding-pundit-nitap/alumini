"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";

import { Button } from "@nitap/ui/components/button";
import { Input } from "@nitap/ui/components/input";

import type { ActionResult } from "@/lib/action-result";

import {
  formatPaise,
  MAX_PLEDGE_PAISE,
  MIN_PLEDGE_PAISE,
} from "../../domain/donation";
import { useDonationAction } from "./use-donation-action";

export type PledgeAction = (
  campaignId: string,
  input: { amount: string; paymentReference: string }
) => Promise<ActionResult<{ donationId: string }>>;

/**
 * The member records what they will pay; the payment itself happens outside the
 * app.
 */
export function PledgeForm(props: {
  campaignId: string;
  action: PledgeAction;
}) {
  const router = useRouter();
  const amountId = useId();
  const referenceId = useId();
  const hintId = useId();
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const { pending, error, run } = useDonationAction();

  return (
    <form
      method="post"
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        run(
          () =>
            props.action(props.campaignId, {
              amount,
              paymentReference: reference,
            }),
          () => router.push("/donations?pledged=1")
        );
      }}
    >
      <div className="flex flex-col gap-1">
        <label htmlFor={amountId} className="text-sm font-medium">
          Amount (₹)
        </label>
        <Input
          id={amountId}
          inputMode="decimal"
          required
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="e.g. 2,000"
        />
        <p className="text-muted-foreground text-xs">
          Between {formatPaise(MIN_PLEDGE_PAISE)} and{" "}
          {formatPaise(MAX_PLEDGE_PAISE)}.
        </p>
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor={referenceId} className="text-sm font-medium">
          Payment reference (optional)
        </label>
        <Input
          id={referenceId}
          value={reference}
          onChange={(e) => setReference(e.target.value)}
          aria-describedby={hintId}
          placeholder="UTR or cheque number"
          autoComplete="off"
        />
        <p id={hintId} className="text-muted-foreground text-xs">
          Already paid? Add the UTR or cheque number now, or later from your
          donations page. Pledges with no reference lapse after 30 days.
        </p>
      </div>
      {error ? (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      ) : null}
      <Button
        type="submit"
        disabled={pending}
        className="self-start rounded-full"
      >
        Record my pledge
      </Button>
    </form>
  );
}
