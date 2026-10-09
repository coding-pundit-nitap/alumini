"use client";

import { Button } from "@nitap/ui/components/button";
import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";

import type { ActionResult } from "@/lib/action-result";

import { validate, type FieldErrors } from "../api/schemas";
import { EVIDENCE_FIELDS, evidenceSchema } from "../api/verification-schemas";
import { FormField, FormMessage } from "./form-field";

type Option = { id: string; name: string };

const YEARS = Array.from(
  { length: new Date().getFullYear() - 2009 },
  (_, i) => new Date().getFullYear() - i
);

function Select({
  label,
  name,
  value,
  onChange,
  options,
  placeholder,
  error,
}: {
  label: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  placeholder: string;
  error?: string;
}) {
  const id = `field-${name}`;
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <select
        id={id}
        name={name}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={error ? true : undefined}
        className="border-input bg-background h-8 w-full rounded-lg border px-2.5 text-sm"
      >
        <option value="">{placeholder}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {error ? (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/**
 * The evidence an alumnus without an institutional email submits. Sends only the named
 * fields; the applicant is the signed-in user, never a form field.
 */
export function EvidenceForm({
  action,
  departments,
  degrees,
}: {
  action: (formData: FormData) => Promise<ActionResult<{ requestId: string }>>;
  departments: Option[];
  degrees: Option[];
}) {
  const router = useRouter();
  const [values, setValues] = useState<
    Record<(typeof EVIDENCE_FIELDS)[number], string>
  >({
    rollNumber: "",
    departmentId: "",
    degreeId: "",
    graduationYear: "",
    supportingInfo: "",
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const set = (key: keyof typeof values) => (value: string) =>
    setValues((current) => ({ ...current, [key]: value }));

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const check = validate(evidenceSchema, values);
    if (!check.ok) {
      setErrors(check.errors);
      setFormError(null);
      return;
    }
    setErrors({});
    setFormError(null);

    const formData = new FormData();
    for (const key of EVIDENCE_FIELDS) formData.set(key, values[key]);

    startTransition(async () => {
      const result = await action(formData);
      if (result.ok) {
        router.refresh();
        return;
      }
      setErrors(result.error.fields ?? {});
      setFormError(result.error.message);
    });
  }

  return (
    <form method="post" onSubmit={onSubmit} noValidate className="space-y-4">
      <FormField
        label="Roll / enrolment number"
        name="rollNumber"
        value={values.rollNumber}
        onChange={set("rollNumber")}
        error={errors.rollNumber}
      />
      <Select
        label="Department"
        name="departmentId"
        value={values.departmentId}
        onChange={set("departmentId")}
        placeholder="Select…"
        error={errors.departmentId}
        options={departments.map((d) => ({ value: d.id, label: d.name }))}
      />
      <Select
        label="Degree"
        name="degreeId"
        value={values.degreeId}
        onChange={set("degreeId")}
        placeholder="Select…"
        error={errors.degreeId}
        options={degrees.map((d) => ({ value: d.id, label: d.name }))}
      />
      <Select
        label="Graduation year"
        name="graduationYear"
        value={values.graduationYear}
        onChange={set("graduationYear")}
        placeholder="Select…"
        error={errors.graduationYear}
        options={YEARS.map((y) => ({ value: String(y), label: String(y) }))}
      />
      <FormField
        label="Anything else that helps us confirm (optional)"
        name="supportingInfo"
        value={values.supportingInfo}
        onChange={set("supportingInfo")}
        error={errors.supportingInfo}
      />
      <p className="text-muted-foreground text-xs">
        A person from the alumni team reviews every request.
      </p>
      {formError ? <FormMessage tone="error">{formError}</FormMessage> : null}
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Submitting…" : "Submit for review"}
      </Button>
    </form>
  );
}
