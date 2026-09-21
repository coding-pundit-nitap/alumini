"use client";

import { Button } from "@nitap/ui/components/button";
import { Input } from "@nitap/ui/components/input";
import { useActionState, useEffect, useRef } from "react";

import {
  fieldErrors,
  formError,
  type ItemAction,
  type ItemActionResult,
} from "./detail-form-support";

/** Adds one skill. Skills have no edit; remove and re-add covers a typo (spec 3B). */
export function SkillForm({ action }: { action: ItemAction }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [result, submit, pending] = useActionState<
    ItemActionResult | null,
    FormData
  >((_previous, formData) => action(formData), null);
  const errors = fieldErrors(result);

  useEffect(() => {
    if (result?.ok && inputRef.current) inputRef.current.value = "";
  }, [result]);

  return (
    <form action={submit} className="flex flex-wrap items-end gap-2">
      <div className="space-y-1.5">
        <label htmlFor="skill-add" className="text-sm font-medium">
          Add a skill
        </label>
        <Input id="skill-add" name="skill" ref={inputRef} maxLength={80} />
        {errors.skill ? (
          <p role="alert" className="text-destructive text-sm">
            {errors.skill}
          </p>
        ) : null}
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Adding…" : "Add"}
      </Button>
      {formError(result) ? (
        <p role="alert" className="text-destructive w-full text-sm">
          {formError(result)}
        </p>
      ) : null}
    </form>
  );
}
