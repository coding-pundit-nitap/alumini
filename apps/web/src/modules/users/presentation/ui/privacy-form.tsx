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
  "border-input bg-background focus-visible:ring-ring/60 h-9 w-full rounded-lg border px-2.5 text-sm outline-none focus-visible:ring-2 sm:w-56 sm:shrink-0";
const ROW_CLASS =
  "flex flex-col gap-2 border-b px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:px-5";
const HEADING_CLASS =
  "text-muted-foreground px-4 pt-5 pb-1 text-xs font-semibold tracking-wide uppercase sm:px-5";

/** What each profile level means in practice, shown under the level picker. */
const LEVEL_HINT: Record<Visibility, string> = {
  PUBLIC: "Anyone with the link can see your profile, even without an account.",
  MEMBERS_ONLY: "Signed-in members verified by the institute.",
  CONNECTIONS_ONLY: "Only people you are connected with.",
  PRIVATE: "Hidden from everyone else, including the directory.",
};

/** Section labels and the field's question, in the fixed display order. */
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

/** Overrides can only be as strict or stricter than the level. The server enforces the same rule. */
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
    <form action={submit}>
      <h2 className={HEADING_CLASS}>Your profile</h2>
      <div className={ROW_CLASS}>
        <div className="min-w-0 leading-tight">
          <label htmlFor="field-visibility" className="text-sm font-medium">
            Who can see your profile
          </label>
          <p className="text-muted-foreground mt-0.5 text-xs">
            {LEVEL_HINT[visibility]}
          </p>
          {errors.visibility ? (
            <p role="alert" className="text-destructive mt-1 text-xs">
              {errors.visibility}
            </p>
          ) : null}
        </div>
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
      </div>

      <h2 className={HEADING_CLASS}>Sections</h2>
      <p className="text-muted-foreground px-4 pb-2 text-xs sm:px-5">
        A section can be as visible as your profile or stricter, never more
        visible.
      </p>
      {OVERRIDE_SECTIONS.map((section) => {
        const copy = SECTION_COPY[section];
        const id = `field-${section}`;
        return (
          <div key={section} className={ROW_CLASS}>
            <div className="min-w-0 leading-tight">
              <label htmlFor={id} className="text-sm font-medium">
                {copy.label}
              </label>
              {copy.hint ? (
                <p className="text-muted-foreground mt-0.5 text-xs">
                  {copy.hint}
                </p>
              ) : null}
              {errors[section] ? (
                <p role="alert" className="text-destructive mt-1 text-xs">
                  {errors[section]}
                </p>
              ) : null}
            </div>
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
          </div>
        );
      })}

      <div className="flex items-center justify-end gap-3 border-b px-4 py-3.5 sm:px-5">
        {result && !result.ok && !result.error.fields ? (
          <p role="alert" className="text-destructive mr-auto text-sm">
            {result.error.message}
          </p>
        ) : null}
        {result?.ok ? (
          <p role="status" className="text-success mr-auto text-sm">
            Privacy settings saved.
          </p>
        ) : null}
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save privacy settings"}
        </Button>
      </div>
    </form>
  );
}
