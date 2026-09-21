"use client";

import { Button } from "@nitap/ui/components/button";
import { Input } from "@nitap/ui/components/input";
import { useState, useTransition, type FormEvent } from "react";

import type { ActionResult } from "@/lib/action-result";

import type { MentorProfileRecord } from "../../application/mentor-ports";
import {
  CONTACT_METHODS,
  type MentorProfileInput,
} from "../../domain/mentor-profile";

const TEXTAREA_CLASS =
  "border-input bg-background min-h-24 w-full rounded-lg border px-2.5 py-2 text-sm";
const SELECT_CLASS =
  "border-input bg-background h-9 w-full rounded-md border px-2";

const CONTACT_LABEL: Record<(typeof CONTACT_METHODS)[number], string> = {
  IN_APP: "In-app message",
  EMAIL: "Email",
  VIDEO_CALL: "Video call",
  PHONE: "Phone",
};

/**
 * Opt in and edit the mentor offer (FR-MENTOR-001/002). Controlled fields, submitted as one object rather
 * than FormData because topics are typed as free text and split into a list before the call.
 */
export function MentorSettingsForm({
  defaults,
  listedNote,
  saveAction,
}: {
  defaults: MentorProfileRecord | null;
  listedNote: string | null;
  saveAction: (input: unknown) => Promise<ActionResult<{ saved: true }>>;
}) {
  const [expertise, setExpertise] = useState(defaults?.expertise ?? "");
  const [topics, setTopics] = useState(defaults?.topics.join(", ") ?? "");
  const [availability, setAvailability] = useState(
    defaults?.availability ?? ""
  );
  const [preferredContactMethod, setPreferredContactMethod] = useState<
    MentorProfileInput["preferredContactMethod"]
  >(defaults?.preferredContactMethod ?? "IN_APP");
  const [maxMentees, setMaxMentees] = useState(
    String(defaults?.maxMentees ?? 3)
  );
  const [accepting, setAccepting] = useState(defaults?.accepting ?? true);

  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await saveAction({
        expertise,
        topics: topics
          .split(",")
          .map((topic) => topic.trim())
          .filter(Boolean),
        availability,
        preferredContactMethod,
        maxMentees: Number(maxMentees),
        accepting,
      });
      if (result.ok) setSaved(true);
      else setError(result.error.message);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <p className="text-muted-foreground text-sm">
        Mentees see your name, photo, headline, expertise, topics and
        availability.
      </p>
      {listedNote ? (
        <p role="status" className="text-sm">
          {listedNote}
        </p>
      ) : null}
      <label className="block space-y-1.5 text-sm">
        <span className="font-medium">Expertise</span>
        <textarea
          value={expertise}
          onChange={(event) => setExpertise(event.target.value)}
          maxLength={1000}
          required
          className={TEXTAREA_CLASS}
        />
      </label>
      <label className="block space-y-1.5 text-sm">
        <span className="font-medium">Topics</span>
        <Input
          value={topics}
          onChange={(event) => setTopics(event.target.value)}
          placeholder="career switching, resumes, system design"
        />
      </label>
      <label className="block space-y-1.5 text-sm">
        <span className="font-medium">Availability</span>
        <Input
          value={availability}
          onChange={(event) => setAvailability(event.target.value)}
          maxLength={200}
        />
      </label>
      <label className="block space-y-1.5 text-sm">
        <span className="font-medium">Preferred contact method</span>
        <select
          value={preferredContactMethod}
          onChange={(event) =>
            setPreferredContactMethod(
              event.target.value as MentorProfileInput["preferredContactMethod"]
            )
          }
          className={SELECT_CLASS}
        >
          {CONTACT_METHODS.map((method) => (
            <option key={method} value={method}>
              {CONTACT_LABEL[method]}
            </option>
          ))}
        </select>
      </label>
      <label className="block space-y-1.5 text-sm">
        <span className="font-medium">Maximum mentees</span>
        <Input
          type="number"
          min={1}
          max={20}
          value={maxMentees}
          onChange={(event) => setMaxMentees(event.target.value)}
        />
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={!accepting}
          onChange={(event) => setAccepting(!event.target.checked)}
        />
        <span>Not accepting new mentees</span>
      </label>
      {error ? (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      ) : null}
      {saved ? (
        <p role="status" className="text-sm">
          Saved.
        </p>
      ) : null}
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save"}
      </Button>
    </form>
  );
}
