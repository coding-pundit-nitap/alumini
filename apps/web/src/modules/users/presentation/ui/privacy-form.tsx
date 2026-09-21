"use client";

import { Button } from "@nitap/ui/components/button";
import { useActionState, useState } from "react";

import type { ActionResult } from "@/lib/action-result";

import { VISIBILITY_LEVELS, type Visibility } from "../../domain/visibility";
import { LEVEL_LABEL, levelsAtLeast } from "./visibility-options";

type SaveResult = ActionResult<{ saved: true }> | null;
type Override = Visibility | "INHERIT";

const SELECT_CLASS =
  "border-input bg-background h-8 w-full rounded-lg border px-2.5 text-sm";

/**
 * Profile level plus the location override (3B adds the other sections). An override can only be equal to
 * or stricter than the level: looser options are disabled, and changing the level resets a now-looser
 * override to "Same as your profile". The server enforces the same rule.
 */
export function PrivacyForm({
  action,
  defaults,
}: {
  action: (formData: FormData) => Promise<ActionResult<{ saved: true }>>;
  defaults: { visibility: Visibility; location: Visibility | null };
}) {
  const [visibility, setVisibility] = useState<Visibility>(defaults.visibility);
  const [location, setLocation] = useState<Override>(
    defaults.location ?? "INHERIT"
  );
  const [result, submit, pending] = useActionState<SaveResult, FormData>(
    (_previous, formData) => action(formData),
    null
  );
  const errors = result && !result.ok ? (result.error.fields ?? {}) : {};
  const allowed = levelsAtLeast(visibility);

  function changeLevel(next: Visibility) {
    setVisibility(next);
    if (location !== "INHERIT" && !levelsAtLeast(next).includes(location)) {
      setLocation("INHERIT");
    }
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

      <div className="space-y-1.5">
        <label htmlFor="field-location" className="text-sm font-medium">
          Who can see your location
        </label>
        <select
          id="field-location"
          name="location"
          value={location}
          className={SELECT_CLASS}
          onChange={(event) => setLocation(event.target.value as Override)}
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
        <p className="text-muted-foreground text-xs">
          A section can be as visible as your profile or stricter, never more
          visible.
        </p>
        {errors.location ? (
          <p role="alert" className="text-destructive text-sm">
            {errors.location}
          </p>
        ) : null}
      </div>

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
