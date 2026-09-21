"use client";

import { Button } from "@nitap/ui/components/button";
import { Input } from "@nitap/ui/components/input";
import { useActionState, useId } from "react";

import type { EducationInput } from "../../domain/profile-items";
import {
  fieldErrors,
  formError,
  type ItemAction,
  type ItemActionResult,
} from "./detail-form-support";

/** One additional-education entry (spec 3B E-1). The institutional record is not edited here. */
export function EducationForm({
  action,
  id,
  defaults,
}: {
  action: ItemAction;
  id?: string;
  defaults?: EducationInput;
}) {
  const uid = useId();
  const fieldId = (name: string) => `${uid}-${name}`;
  const [result, submit, pending] = useActionState<
    ItemActionResult | null,
    FormData
  >((_previous, formData) => action(formData), null);
  const errors = fieldErrors(result);

  return (
    <form action={submit} className="space-y-3">
      {id ? <input type="hidden" name="id" value={id} /> : null}
      <div className="space-y-1.5">
        <label htmlFor={fieldId("institution")} className="text-sm font-medium">
          Institution
        </label>
        <Input
          id={fieldId("institution")}
          name="institution"
          defaultValue={defaults?.institution}
          maxLength={300}
        />
        {errors.institution ? (
          <p role="alert" className="text-destructive text-sm">
            {errors.institution}
          </p>
        ) : null}
      </div>
      <div className="space-y-1.5">
        <label
          htmlFor={fieldId("qualification")}
          className="text-sm font-medium"
        >
          Qualification
        </label>
        <Input
          id={fieldId("qualification")}
          name="qualification"
          defaultValue={defaults?.qualification}
          maxLength={200}
        />
        {errors.qualification ? (
          <p role="alert" className="text-destructive text-sm">
            {errors.qualification}
          </p>
        ) : null}
      </div>
      <div className="space-y-1.5">
        <label htmlFor={fieldId("field")} className="text-sm font-medium">
          Field of study (optional)
        </label>
        <Input
          id={fieldId("field")}
          name="fieldOfStudy"
          defaultValue={defaults?.fieldOfStudy ?? ""}
          maxLength={200}
        />
        {errors.fieldOfStudy ? (
          <p role="alert" className="text-destructive text-sm">
            {errors.fieldOfStudy}
          </p>
        ) : null}
      </div>
      <div className="flex gap-3">
        <div className="flex-1 space-y-1.5">
          <label htmlFor={fieldId("start")} className="text-sm font-medium">
            Start year
          </label>
          <Input
            id={fieldId("start")}
            name="startYear"
            inputMode="numeric"
            defaultValue={defaults?.startYear}
          />
          {errors.startYear ? (
            <p role="alert" className="text-destructive text-sm">
              {errors.startYear}
            </p>
          ) : null}
        </div>
        <div className="flex-1 space-y-1.5">
          <label htmlFor={fieldId("end")} className="text-sm font-medium">
            End year (leave empty if ongoing)
          </label>
          <Input
            id={fieldId("end")}
            name="endYear"
            inputMode="numeric"
            defaultValue={defaults?.endYear ?? ""}
          />
          {errors.endYear ? (
            <p role="alert" className="text-destructive text-sm">
              {errors.endYear}
            </p>
          ) : null}
        </div>
      </div>
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
