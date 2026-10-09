"use client";

import { Label } from "@nitap/ui/components/label";
import { Switch } from "@nitap/ui/components/switch";
import { Lock } from "lucide-react";

export type PreferenceRow = { domain: string; email: boolean };

/** A friendly title and one line per domain; an unknown domain falls back to its lowercased name. */
const DOMAIN_COPY: Record<string, { title: string; description: string }> = {
  CONNECTION: {
    title: "Connections",
    description: "New requests and accepted requests",
  },
  MENTORSHIP: {
    title: "Mentorship",
    description: "Requests and changes to your mentorships",
  },
  MESSAGE: {
    title: "Messages",
    description: "New messages, at most one email per conversation burst",
  },
  JOB: { title: "Jobs", description: "Your job posts going live or rejected" },
  EVENT: {
    title: "Events",
    description: "Registrations and cancelled events",
  },
  POST: { title: "Posts", description: "Comments on posts you follow" },
  ACHIEVEMENT: {
    title: "Achievements",
    description: "Decisions on achievements you submit",
  },
  MODERATION: {
    title: "Moderation",
    description: "When a moderator removes something of yours",
  },
  ANNOUNCEMENT: {
    title: "Announcements",
    description: "Institute announcements",
  },
};

const ROW = "flex items-center justify-between gap-4 px-4 py-3.5 sm:px-5";

/**
 * Email toggle per ENGAGEMENT domain. Switches are named via `aria-labelledby` because Base UI puts
 * `id` on a hidden input.
 */
export function PreferencesForm({
  preferences,
  onChange,
  pendingDomains,
}: {
  preferences: PreferenceRow[];
  onChange: (domain: string, enabled: boolean) => void;
  /** Disabled while a PATCH is in flight so a second toggle can't race the first. */
  pendingDomains?: ReadonlySet<string>;
}) {
  return (
    <div>
      <section aria-labelledby="always-on" className="border-b">
        <h2
          id="always-on"
          className="text-muted-foreground px-4 pt-5 pb-2 text-xs font-medium tracking-wide uppercase sm:px-5"
        >
          Always on
        </h2>
        <div className={ROW}>
          <div className="min-w-0">
            <Label
              id="account-security-title"
              htmlFor="account-security"
              className="font-medium"
            >
              Account &amp; security emails
            </Label>
            <p
              id="account-security-hint"
              className="text-muted-foreground mt-0.5 text-xs"
            >
              Sign-in, verification and account status. These can&apos;t be
              turned off.
            </p>
          </div>
          <span className="flex items-center gap-2">
            <Lock aria-hidden className="text-muted-foreground size-3.5" />
            <Switch
              id="account-security"
              aria-labelledby="account-security-title"
              aria-describedby="account-security-hint"
              checked
              disabled
            />
          </span>
        </div>
      </section>
      <section aria-labelledby="email-me" className="border-b">
        <h2
          id="email-me"
          className="text-muted-foreground px-4 pt-5 pb-2 text-xs font-medium tracking-wide uppercase sm:px-5"
        >
          Email me about
        </h2>
        <ul className="divide-border divide-y">
          {preferences.map((pref) => {
            const name = pref.domain.toLowerCase();
            const copy = DOMAIN_COPY[pref.domain];
            return (
              <li key={pref.domain} className={ROW}>
                <div className="min-w-0">
                  <Label
                    id={`pref-${pref.domain}-title`}
                    htmlFor={`pref-${pref.domain}`}
                    className="font-medium capitalize"
                  >
                    {copy?.title ?? name}
                  </Label>
                  {copy ? (
                    <p
                      id={`pref-${pref.domain}-hint`}
                      className="text-muted-foreground mt-0.5 text-xs"
                    >
                      {copy.description}
                    </p>
                  ) : null}
                </div>
                <Switch
                  id={`pref-${pref.domain}`}
                  aria-labelledby={`pref-${pref.domain}-title`}
                  aria-describedby={
                    copy ? `pref-${pref.domain}-hint` : undefined
                  }
                  checked={pref.email}
                  disabled={pendingDomains?.has(pref.domain)}
                  onCheckedChange={(checked) => onChange(pref.domain, checked)}
                />
              </li>
            );
          })}
        </ul>
      </section>
      <p className="text-muted-foreground px-4 py-4 text-xs sm:px-5">
        In-app notifications are always on; these switches only control email.
      </p>
    </div>
  );
}
