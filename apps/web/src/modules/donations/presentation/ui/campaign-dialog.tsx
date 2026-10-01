"use client";

import { useId, useState, type ReactNode } from "react";

import { Input } from "@nitap/ui/components/input";
import { Textarea } from "@nitap/ui/components/textarea";

import type { ActionResult } from "@/lib/action-result";

import type { Campaign } from "../../domain/donation";
import { ActionDialog } from "./action-dialog";

export type CampaignFields = {
  title: string;
  description: string;
  purpose: string;
  paymentInstructions: string;
  goal: string;
  startsOn: string;
  endsOn: string;
};
export type SaveCampaignAction = (
  campaignId: string | null,
  input: CampaignFields
) => Promise<ActionResult<unknown>>;

const fromCampaign = (c: Campaign | undefined): CampaignFields => ({
  title: c?.title ?? "",
  description: c?.description ?? "",
  purpose: c?.purpose ?? "",
  paymentInstructions: c?.paymentInstructions ?? "",
  goal: c?.goalPaise ? String(c.goalPaise / 100) : "",
  startsOn: c?.startsOn ?? "",
  endsOn: c?.endsOn ?? "",
});

function Field(props: {
  label: string;
  hint?: string;
  children: (id: string) => ReactNode;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium">
        {props.label}
      </label>
      {props.children(id)}
      {props.hint ? (
        <p className="text-muted-foreground text-xs">{props.hint}</p>
      ) : null}
    </div>
  );
}

/** FR-DON-001: create (DRAFT) or edit a campaign, including the offline payment instructions (XD-6). */
export function CampaignDialog(props: {
  campaign?: Campaign;
  action: SaveCampaignAction;
}) {
  const [v, setV] = useState(() => fromCampaign(props.campaign));
  const set =
    (key: keyof CampaignFields) => (e: { target: { value: string } }) =>
      setV((prev) => ({ ...prev, [key]: e.target.value }));
  const editing = props.campaign !== undefined;

  return (
    <ActionDialog
      trigger={editing ? "Edit" : "New campaign"}
      triggerVariant={editing ? "outline" : "default"}
      title={editing ? "Edit campaign" : "New campaign"}
      description={
        editing
          ? undefined
          : "Starts as a draft. Members see it once you activate it."
      }
      submitLabel={editing ? "Save" : "Create draft"}
      submit={() => props.action(props.campaign?.id ?? null, v)}
      onClose={() => setV(fromCampaign(props.campaign))}
    >
      <div className="flex max-h-[60vh] flex-col gap-3 overflow-y-auto pr-1">
        <Field label="Title">
          {(id) => (
            <Input id={id} value={v.title} onChange={set("title")} required />
          )}
        </Field>
        <Field label="Purpose" hint="One line: what the money is for.">
          {(id) => (
            <Input
              id={id}
              value={v.purpose}
              onChange={set("purpose")}
              required
            />
          )}
        </Field>
        <Field label="Description">
          {(id) => (
            <Textarea
              id={id}
              value={v.description}
              onChange={set("description")}
              rows={4}
              required
            />
          )}
        </Field>
        <Field
          label="Payment instructions"
          hint="Bank account, UPI ID or cheque address. Members pay outside the app."
        >
          {(id) => (
            <Textarea
              id={id}
              value={v.paymentInstructions}
              onChange={set("paymentInstructions")}
              rows={4}
              required
            />
          )}
        </Field>
        <Field label="Goal (₹, optional)">
          {(id) => (
            <Input
              id={id}
              inputMode="decimal"
              value={v.goal}
              onChange={set("goal")}
            />
          )}
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Starts on">
            {(id) => (
              <Input
                id={id}
                type="date"
                value={v.startsOn}
                onChange={set("startsOn")}
                required
              />
            )}
          </Field>
          <Field label="Ends on">
            {(id) => (
              <Input
                id={id}
                type="date"
                value={v.endsOn}
                onChange={set("endsOn")}
                required
              />
            )}
          </Field>
        </div>
      </div>
    </ActionDialog>
  );
}
