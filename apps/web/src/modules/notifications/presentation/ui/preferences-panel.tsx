"use client";

import { useState } from "react";

import { PreferencesForm, type PreferenceRow } from "./preferences-form";

const JSON_HEADERS = { "content-type": "application/json" };

async function errorMessage(res: Response, fallback: string): Promise<string> {
  const body = (await res.json().catch(() => null)) as {
    error?: { message?: string };
  } | null;
  return body?.error?.message ?? fallback;
}

/** The `/settings/notifications` client shell: owns the optimistic toggle + PATCH around the
 * server-rendered preference rows. `PreferencesForm` stays a dumb presentational component. A failed PATCH
 * (non-2xx or a network error) reverts the toggle and surfaces a short message. */
export function PreferencesPanel({
  initialPreferences,
}: {
  initialPreferences: PreferenceRow[];
}) {
  const [preferences, setPreferences] = useState(initialPreferences);
  const [error, setError] = useState<string | null>(null);

  const onChange = async (domain: string, enabled: boolean) => {
    setError(null);
    // Revert only this domain's own prior value on failure: another domain's toggle may resolve
    // while this one is still in flight, and its success must survive a whole-array rollback.
    const previousEmail =
      preferences.find((pref) => pref.domain === domain)?.email ?? true;
    const revert = () =>
      setPreferences((current) =>
        current.map((pref) =>
          pref.domain === domain ? { ...pref, email: previousEmail } : pref
        )
      );
    setPreferences((current) =>
      current.map((pref) =>
        pref.domain === domain ? { ...pref, email: enabled } : pref
      )
    );
    try {
      const response = await fetch("/api/v1/notifications/preferences", {
        method: "PATCH",
        headers: JSON_HEADERS,
        body: JSON.stringify({ domain, enabled }),
      });
      if (!response.ok) {
        revert();
        setError(
          await errorMessage(
            response,
            "Could not save that preference. Please try again."
          )
        );
      }
    } catch {
      revert();
      setError(
        "Could not save that preference. Check your connection and try again."
      );
    }
  };

  return (
    <div className="space-y-4">
      {error ? (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      ) : null}
      <PreferencesForm
        preferences={preferences}
        onChange={(domain, enabled) => void onChange(domain, enabled)}
      />
    </div>
  );
}
