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

const withDomain = (domains: Set<string>, domain: string) =>
  new Set(domains).add(domain);
const withoutDomain = (domains: Set<string>, domain: string) => {
  const next = new Set(domains);
  next.delete(domain);
  return next;
};

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
  // Domains with a PATCH in flight. Their switch is disabled (see PreferencesForm) so a same-domain
  // double-toggle can never overlap two PATCHes and race a revert against a value captured mid-flight.
  const [pendingDomains, setPendingDomains] = useState<Set<string>>(
    () => new Set()
  );

  const onChange = async (domain: string, enabled: boolean) => {
    if (pendingDomains.has(domain)) return; // guarded by the disabled switch; defensive only
    setError(null);
    // Every domain always has a row by the time it reaches here (the API defaults a missing one to
    // enabled, N-10), and the disabled switch above rules out a second concurrent write to the same
    // domain, so this lookup can't miss.
    const previousEmail = preferences.find(
      (pref) => pref.domain === domain
    )!.email;
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
    setPendingDomains((current) => withDomain(current, domain));
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
    } finally {
      setPendingDomains((current) => withoutDomain(current, domain));
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
        pendingDomains={pendingDomains}
      />
    </div>
  );
}
