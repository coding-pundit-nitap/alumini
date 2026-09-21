"use client";

import { Button } from "@nitap/ui/components/button";
import { Input } from "@nitap/ui/components/input";
import { useActionState, useId } from "react";

import {
  LINK_TYPES,
  type LinkInput,
  type LinkType,
} from "../../domain/profile-items";
import {
  fieldErrors,
  formError,
  type ItemAction,
  type ItemActionResult,
} from "./detail-form-support";

const TYPE_LABEL: Record<LinkType, string> = {
  LINKEDIN: "LinkedIn",
  GITHUB: "GitHub",
  TWITTER: "X (Twitter)",
  WEBSITE: "Website",
  OTHER: "Other",
};

/** Adds a social or web link (https only, checked server-side), or (with `id`/`defaults`) edits one. */
export function LinkForm({
  action,
  id,
  defaults,
}: {
  action: ItemAction;
  id?: string;
  defaults?: LinkInput;
}) {
  const uid = useId();
  const fieldId = (name: string) => `${uid}-${name}`;
  const [result, submit, pending] = useActionState<
    ItemActionResult | null,
    FormData
  >((_previous, formData) => action(formData), null);
  const errors = fieldErrors(result);

  return (
    <form action={submit} className="flex flex-wrap items-end gap-2">
      {id ? <input type="hidden" name="id" value={id} /> : null}
      <div className="space-y-1.5">
        <label htmlFor={fieldId("type")} className="text-sm font-medium">
          Type
        </label>
        <select
          id={fieldId("type")}
          name="type"
          defaultValue={defaults?.type ?? "WEBSITE"}
          className="border-input bg-background h-8 rounded-lg border px-2.5 text-sm"
        >
          {LINK_TYPES.map((type) => (
            <option key={type} value={type}>
              {TYPE_LABEL[type]}
            </option>
          ))}
        </select>
      </div>
      <div className="min-w-64 flex-1 space-y-1.5">
        <label htmlFor={fieldId("url")} className="text-sm font-medium">
          URL
        </label>
        <Input
          id={fieldId("url")}
          name="url"
          placeholder="https://…"
          defaultValue={defaults?.url}
          maxLength={2048}
        />
        {errors.url ? (
          <p role="alert" className="text-destructive text-sm">
            {errors.url}
          </p>
        ) : null}
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : id ? "Save" : "Add"}
      </Button>
      {formError(result) ? (
        <p role="alert" className="text-destructive w-full text-sm">
          {formError(result)}
        </p>
      ) : null}
    </form>
  );
}
