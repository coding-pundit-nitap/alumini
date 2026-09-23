"use client";

import { useState } from "react";

import { PreferencesForm, type PreferenceRow } from "./preferences-form";

const JSON_HEADERS = { "content-type": "application/json" };

/** The `/settings/notifications` client shell: owns the optimistic toggle + PATCH around the
 * server-rendered preference rows. `PreferencesForm` stays a dumb presentational component. */
export function PreferencesPanel({
  initialPreferences,
}: {
  initialPreferences: PreferenceRow[];
}) {
  const [preferences, setPreferences] = useState(initialPreferences);

  const onChange = (domain: string, enabled: boolean) => {
    setPreferences((previous) =>
      previous.map((pref) =>
        pref.domain === domain ? { ...pref, email: enabled } : pref
      )
    );
    void fetch("/api/v1/notifications/preferences", {
      method: "PATCH",
      headers: JSON_HEADERS,
      body: JSON.stringify({ domain, enabled }),
    }).catch(() => undefined);
  };

  return <PreferencesForm preferences={preferences} onChange={onChange} />;
}
