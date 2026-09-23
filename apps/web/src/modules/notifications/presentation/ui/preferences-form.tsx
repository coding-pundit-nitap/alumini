"use client";

import { Label } from "@nitap/ui/components/label";
import { Switch } from "@nitap/ui/components/switch";

export type PreferenceRow = { domain: string; email: boolean };

/** Email toggle per ENGAGEMENT domain. A domain with no preference row still arrives here as `email: true`
 * (the API defaults a missing row to enabled, N-10) — this form just renders whatever it is given. */
export function PreferencesForm({
  preferences,
  onChange,
  pendingDomains,
}: {
  preferences: PreferenceRow[];
  onChange: (domain: string, enabled: boolean) => void;
  /** Domains with a PATCH in flight: their switch is disabled so a second toggle can't race the first
   * (finding: a same-domain double-toggle before the first PATCH resolves could revert to the first
   * call's optimistic value instead of the true server state). */
  pendingDomains?: ReadonlySet<string>;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between opacity-60">
        <Label htmlFor="account-security">Account &amp; security emails</Label>
        <Switch id="account-security" checked disabled />
      </div>
      {preferences.map((pref) => (
        <div key={pref.domain} className="flex items-center justify-between">
          <Label htmlFor={`pref-${pref.domain}`} className="capitalize">
            {pref.domain.toLowerCase()}
          </Label>
          <Switch
            id={`pref-${pref.domain}`}
            aria-label={pref.domain.toLowerCase()}
            checked={pref.email}
            disabled={pendingDomains?.has(pref.domain)}
            onCheckedChange={(checked) => onChange(pref.domain, checked)}
          />
        </div>
      ))}
    </div>
  );
}
