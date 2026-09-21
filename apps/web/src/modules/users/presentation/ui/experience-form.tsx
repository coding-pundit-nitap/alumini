"use client";

import { Button } from "@nitap/ui/components/button";
import { Input } from "@nitap/ui/components/input";
import { useActionState, useState } from "react";

import type { ExperienceInput } from "../../domain/profile-items";
import {
  fieldErrors,
  formError,
  type ItemAction,
  type ItemActionResult,
} from "./detail-form-support";

export type ExperienceDefaults = Omit<ExperienceInput, "isCurrent"> & {
  isCurrent: boolean;
};

/**
 * One experience entry, add or edit (an `id` switches the button label and includes the hidden field).
 * The end date is disabled and cleared while "current role" is checked, matching the domain rule
 * (`isCurrent` ⇔ no end date) so the form can never submit a combination the server would reject.
 */
export function ExperienceForm({
  action,
  id,
  defaults,
}: {
  action: ItemAction;
  id?: string;
  defaults?: ExperienceDefaults;
}) {
  const [current, setCurrent] = useState(defaults?.isCurrent ?? false);
  const [endDate, setEndDate] = useState(defaults?.endDate ?? "");
  const [result, submit, pending] = useActionState<
    ItemActionResult | null,
    FormData
  >((_previous, formData) => action(formData), null);
  const errors = fieldErrors(result);

  return (
    <form action={submit} className="space-y-3">
      {id ? <input type="hidden" name="id" value={id} /> : null}
      <div className="space-y-1.5">
        <label htmlFor="exp-company" className="text-sm font-medium">
          Company
        </label>
        <Input
          id="exp-company"
          name="company"
          defaultValue={defaults?.company}
          maxLength={200}
        />
        {errors.company ? (
          <p role="alert" className="text-destructive text-sm">
            {errors.company}
          </p>
        ) : null}
      </div>
      <div className="space-y-1.5">
        <label htmlFor="exp-designation" className="text-sm font-medium">
          Role
        </label>
        <Input
          id="exp-designation"
          name="designation"
          defaultValue={defaults?.designation}
          maxLength={200}
        />
        {errors.designation ? (
          <p role="alert" className="text-destructive text-sm">
            {errors.designation}
          </p>
        ) : null}
      </div>
      <div className="space-y-1.5">
        <label htmlFor="exp-industry" className="text-sm font-medium">
          Industry (optional)
        </label>
        <Input
          id="exp-industry"
          name="industry"
          defaultValue={defaults?.industry ?? ""}
          maxLength={160}
        />
        {errors.industry ? (
          <p role="alert" className="text-destructive text-sm">
            {errors.industry}
          </p>
        ) : null}
      </div>
      <div className="flex gap-3">
        <div className="flex-1 space-y-1.5">
          <label htmlFor="exp-start" className="text-sm font-medium">
            Start date
          </label>
          <Input
            id="exp-start"
            name="startDate"
            type="date"
            defaultValue={defaults?.startDate}
          />
          {errors.startDate ? (
            <p role="alert" className="text-destructive text-sm">
              {errors.startDate}
            </p>
          ) : null}
        </div>
        <div className="flex-1 space-y-1.5">
          <label htmlFor="exp-end" className="text-sm font-medium">
            End date
          </label>
          <Input
            id="exp-end"
            name="endDate"
            type="date"
            value={endDate}
            disabled={current}
            onChange={(event) => setEndDate(event.target.value)}
          />
          {errors.endDate ? (
            <p role="alert" className="text-destructive text-sm">
              {errors.endDate}
            </p>
          ) : null}
        </div>
      </div>
      <label htmlFor="exp-current" className="flex items-center gap-2 text-sm">
        <input
          id="exp-current"
          type="checkbox"
          name="isCurrent"
          checked={current}
          onChange={(event) => {
            setCurrent(event.target.checked);
            if (event.target.checked) setEndDate("");
          }}
        />
        I currently work here
      </label>
      {formError(result) ? (
        <p role="alert" className="text-destructive text-sm">
          {formError(result)}
        </p>
      ) : null}
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : id ? "Save" : "Add"}
      </Button>
    </form>
  );
}
