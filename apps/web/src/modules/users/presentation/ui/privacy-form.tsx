"use client";

import { Button } from "@nitap/ui/components/button";
import { useActionState, useState } from "react";

import type { ActionResult } from "@/lib/action-result";

import {
  OVERRIDE_SECTIONS,
  VISIBILITY_LEVELS,
  type OverrideSection,
  type Visibility,
} from "../../domain/visibility";
import { LEVEL_LABEL, levelsAtLeast } from "./visibility-options";

type SaveResult = ActionResult<{ saved: true }> | null;
type Override = Visibility | "INHERIT";
type Overrides = Record<OverrideSection, Override>;

const SELECT_CLASS =
  "border-input bg-background h-8 w-full rounded-lg border px-2.5 text-sm";

/** Section labels and the field's question, in the fixed display order (spec 3B E-3). */
const SECTION_COPY: Record<OverrideSection, { label: string; hint?: string }> =
  {
    contact: { label: "Who can see your contact details", hint: "Your links" },
    location: { label: "Who can see your location" },
    experience: {
      label: "Who can see your work experience and skills",
      hint: "Skills follow the same setting as your experience",
    },
    education: { label: "Who can see your education" },
  };

const toOverrides = (
  defaults: Record<OverrideSection, Visibility | null>
): Overrides =>
  Object.fromEntries(
    OVERRIDE_SECTIONS.map((section) => [
      section,
      defaults[section] ?? "INHERIT",
    ])
  ) as Overrides;

/**
 * Profile level plus a per-section override (spec 3A P-2, 3B E-3). An override can only be equal to or
 * stricter than the level: looser options are disabled, and changing the level resets any now-looser
 * override to "Same as your profile" for every section, independently. The server enforces the same rule.
 */
export function PrivacyForm({
  action,
  defaults,
}: {
  action: (formData: FormData) => Promise<ActionResult<{ saved: true }>>;
  defaults: {
    visibility: Visibility;
  } & Record<OverrideSection, Visibility | null>;
}) {
  const [visibility, setVisibility] = useState<Visibility>(defaults.visibility);
  const [overrides, setOverrides] = useState<Overrides>(() =>
    toOverrides(defaults)
  );
  const [result, submit, pending] = useActionState<SaveResult, FormData>(
    (_previous, formData) => action(formData),
    null
  );
  const errors = result && !result.ok ? (result.error.fields ?? {}) : {};
  const allowed = levelsAtLeast(visibility);

  function changeLevel(next: Visibility) {
    setVisibility(next);
    const nextAllowed = levelsAtLeast(next);
    setOverrides((current) => {
      const updated = { ...current };
      for (const section of OVERRIDE_SECTIONS) {
        const value = current[section];
        if (value !== "INHERIT" && !nextAllowed.includes(value)) {
          updated[section] = "INHERIT";
        }
      }
      return updated;
    });
  }

  return (
    <form action={submit} className="space-y-4">
      <div className="space-y-1.5">
        <label htmlFor="field-visibility" className="text-sm font-medium">
          Who can see your profile
        </label>
        <select
          id="field-visibility"
          name="visibility"
          value={visibility}
          className={SELECT_CLASS}
          onChange={(event) => changeLevel(event.target.value as Visibility)}
        >
          {VISIBILITY_LEVELS.map((level) => (
            <option key={level} value={level}>
              {LEVEL_LABEL[level]}
            </option>
          ))}
        </select>
        {errors.visibility ? (
          <p role="alert" className="text-destructive text-sm">
            {errors.visibility}
          </p>
        ) : null}
      </div>

      {OVERRIDE_SECTIONS.map((section) => {
        const copy = SECTION_COPY[section];
        const id = `field-${section}`;
        return (
          <div key={section} className="space-y-1.5">
            <label htmlFor={id} className="text-sm font-medium">
              {copy.label}
            </label>
            <select
              id={id}
              name={section}
              value={overrides[section]}
              className={SELECT_CLASS}
              onChange={(event) =>
                setOverrides((current) => ({
                  ...current,
                  [section]: event.target.value as Override,
                }))
              }
            >
              <option value="INHERIT">Same as your profile</option>
              {VISIBILITY_LEVELS.map((level) => (
                <option
                  key={level}
                  value={level}
                  disabled={!allowed.includes(level)}
                >
                  {LEVEL_LABEL[level]}
                </option>
              ))}
            </select>
            {copy.hint ? (
              <p className="text-muted-foreground text-xs">{copy.hint}</p>
            ) : null}
            {errors[section] ? (
              <p role="alert" className="text-destructive text-sm">
                {errors[section]}
              </p>
            ) : null}
          </div>
        );
      })}
      <p className="text-muted-foreground text-xs">
        A section can be as visible as your profile or stricter, never more
        visible.
      </p>

      {result && !result.ok && !result.error.fields ? (
        <p role="alert" className="text-destructive text-sm">
          {result.error.message}
        </p>
      ) : null}
      {result?.ok ? (
        <p role="status" className="text-sm">
          Privacy settings saved.
        </p>
      ) : null}
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save privacy settings"}
      </Button>
    </form>
  );
}
