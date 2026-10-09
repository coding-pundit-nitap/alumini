"use client";

import { Button } from "@nitap/ui/components/button";
import { Input } from "@nitap/ui/components/input";
import { useActionState, useId, useState } from "react";

import type { ExperienceInput } from "../../domain/profile-items";
import {
  fieldErrors,
  formError,
  useReturnToListOnSavedEdit,
  type ItemAction,
  type ItemActionResult,
} from "./detail-form-support";

export type ExperienceDefaults = Omit<ExperienceInput, "isCurrent"> & {
  isCurrent: boolean;
};

/** The end date is disabled while "current role" is checked, matching the server rule. */
export function ExperienceForm({
  action,
  id,
  defaults,
}: {
  action: ItemAction;
  id?: string;
  defaults?: ExperienceDefaults;
}) {
  const uid = useId();
  const fieldId = (name: string) => `${uid}-${name}`;
  const [current, setCurrent] = useState(defaults?.isCurrent ?? false);
  const [endDate, setEndDate] = useState(defaults?.endDate ?? "");
  const [result, submit, pending] = useActionState<
    ItemActionResult | null,
    FormData
  >((_previous, formData) => action(formData), null);
  const errors = fieldErrors(result);
  useReturnToListOnSavedEdit("experience", id, result);
  // Reset the controlled fields after a successful add, during render rather than in an effect.
  const [seen, setSeen] = useState(result);
  if (result !== seen) {
    setSeen(result);
    if (!id && result?.ok) {
      setCurrent(false);
      setEndDate("");
    }
  }

  return (
    <form action={submit} className="grid gap-3 sm:grid-cols-2">
      {id ? <input type="hidden" name="id" value={id} /> : null}
      <div className="space-y-1.5">
        <label htmlFor={fieldId("company")} className="text-sm font-medium">
          Company
        </label>
        <Input
          id={fieldId("company")}
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
        <label htmlFor={fieldId("designation")} className="text-sm font-medium">
          Role
        </label>
        <Input
          id={fieldId("designation")}
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
      <div className="space-y-1.5 sm:col-span-2">
        <label htmlFor={fieldId("industry")} className="text-sm font-medium">
          Industry (optional)
        </label>
        <Input
          id={fieldId("industry")}
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
      <div className="grid gap-3 sm:col-span-2 sm:grid-cols-2">
        <div className="flex-1 space-y-1.5">
          <label htmlFor={fieldId("start")} className="text-sm font-medium">
            Start date
          </label>
          <Input
            id={fieldId("start")}
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
          <label htmlFor={fieldId("end")} className="text-sm font-medium">
            End date
          </label>
          <Input
            id={fieldId("end")}
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
      <label
        htmlFor={fieldId("current")}
        className="flex items-center gap-2 text-sm sm:col-span-2"
      >
        <input
          id={fieldId("current")}
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
        <p role="alert" className="text-destructive text-sm sm:col-span-2">
          {formError(result)}
        </p>
      ) : null}
      <Button
        type="submit"
        variant="brand"
        disabled={pending}
        className="justify-self-start rounded-full px-5 sm:col-span-2"
      >
        {pending ? "Saving…" : id ? "Save" : "Add"}
      </Button>
    </form>
  );
}
