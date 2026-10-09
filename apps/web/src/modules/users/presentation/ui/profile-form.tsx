"use client";

import { Button } from "@nitap/ui/components/button";
import { Input } from "@nitap/ui/components/input";
import { useActionState, type ReactNode } from "react";

import type { ActionResult } from "@/lib/action-result";

type SaveResult = ActionResult<{ saved: true }> | null;

export type ProfileDefaults = {
  fullName: string;
  headline: string | null;
  bio: string | null;
  location: string | null;
};

const TEXTAREA_CLASS =
  "border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 min-h-32 w-full rounded-lg border px-2.5 py-2 text-sm outline-none focus-visible:ring-3";

function Field({
  label,
  name,
  error,
  children,
}: {
  label: string;
  name: string;
  error?: string;
  children: ReactNode;
}) {
  const id = `field-${name}`;
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-destructive text-sm">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** Uses a form action, so it works without JavaScript. */
export function ProfileForm({
  action,
  defaults,
}: {
  action: (formData: FormData) => Promise<ActionResult<{ saved: true }>>;
  defaults: ProfileDefaults;
}) {
  const [result, submit, pending] = useActionState<SaveResult, FormData>(
    (_previous, formData) => action(formData),
    null
  );
  const errors = result && !result.ok ? (result.error.fields ?? {}) : {};
  const described = (name: string, error?: string) => ({
    "aria-invalid": error ? true : undefined,
    "aria-describedby": error ? `field-${name}-error` : undefined,
  });

  return (
    <form action={submit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Full name" name="fullName" error={errors.fullName}>
          <Input
            id="field-fullName"
            name="fullName"
            defaultValue={defaults.fullName}
            maxLength={200}
            {...described("fullName", errors.fullName)}
          />
        </Field>
        <Field label="Location" name="location" error={errors.location}>
          <Input
            id="field-location"
            name="location"
            defaultValue={defaults.location ?? ""}
            maxLength={200}
            placeholder="e.g. Bengaluru"
            {...described("location", errors.location)}
          />
        </Field>
      </div>
      <Field label="Headline" name="headline" error={errors.headline}>
        <Input
          id="field-headline"
          name="headline"
          defaultValue={defaults.headline ?? ""}
          maxLength={240}
          placeholder="e.g. Software engineer at Acme · CSE '19"
          {...described("headline", errors.headline)}
        />
      </Field>
      <Field label="About you" name="bio" error={errors.bio}>
        <textarea
          id="field-bio"
          name="bio"
          defaultValue={defaults.bio ?? ""}
          maxLength={4000}
          placeholder="A few lines on what you do, what you're into, and how batchmates can help or reach you."
          className={TEXTAREA_CLASS}
          {...described("bio", errors.bio)}
        />
      </Field>
      {result && !result.ok && !result.error.fields ? (
        <p role="alert" className="text-destructive text-sm">
          {result.error.message}
        </p>
      ) : null}
      <div className="flex items-center justify-end gap-3">
        {result?.ok ? (
          <p
            role="status"
            className="text-success animate-in fade-in text-sm font-medium"
          >
            Profile saved.
          </p>
        ) : null}
        <Button
          type="submit"
          variant="brand"
          className="rounded-full px-5"
          disabled={pending}
        >
          {pending ? "Saving…" : "Save profile"}
        </Button>
      </div>
    </form>
  );
}
