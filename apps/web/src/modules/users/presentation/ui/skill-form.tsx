"use client";

import { Button } from "@nitap/ui/components/button";
import { Input } from "@nitap/ui/components/input";
import { useActionState, useEffect, useId, useRef } from "react";

import type { SkillInput } from "../../domain/profile-items";
import {
  fieldErrors,
  formError,
  type ItemAction,
  type ItemActionResult,
} from "./detail-form-support";

/** Adds a skill, or (with `id`/`defaults`) edits one. */
export function SkillForm({
  action,
  id,
  defaults,
}: {
  action: ItemAction;
  id?: string;
  defaults?: SkillInput;
}) {
  const uid = useId();
  const fieldId = `${uid}-skill`;
  const inputRef = useRef<HTMLInputElement>(null);
  const [result, submit, pending] = useActionState<
    ItemActionResult | null,
    FormData
  >((_previous, formData) => action(formData), null);
  const errors = fieldErrors(result);

  useEffect(() => {
    if (!id && result?.ok && inputRef.current) inputRef.current.value = "";
  }, [id, result]);

  return (
    <form action={submit} className="flex flex-wrap items-end gap-2">
      {id ? <input type="hidden" name="id" value={id} /> : null}
      <div className="space-y-1.5">
        <label htmlFor={fieldId} className="text-sm font-medium">
          {id ? "Skill" : "Add a skill"}
        </label>
        <Input
          id={fieldId}
          name="skill"
          ref={inputRef}
          defaultValue={defaults?.skill}
          maxLength={80}
        />
        {errors.skill ? (
          <p role="alert" className="text-destructive text-sm">
            {errors.skill}
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
