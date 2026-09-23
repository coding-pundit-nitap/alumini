"use client";

import { Button } from "@nitap/ui/components/button";
import { Input } from "@nitap/ui/components/input";
import { useState, useTransition, type FormEvent } from "react";

import type { ActionResult } from "@/lib/action-result";

import {
  EMPLOYMENT_TYPES,
  WORK_MODES,
  type EmploymentType,
  type WorkMode,
} from "../../domain/job";

const TEXTAREA_CLASS =
  "border-input bg-background min-h-32 w-full rounded-lg border px-2.5 py-2 text-sm";
const SELECT_CLASS =
  "border-input bg-background h-9 w-full rounded-md border px-2";

const EMPLOYMENT_LABEL: Record<EmploymentType, string> = {
  FULL_TIME: "Full-time",
  PART_TIME: "Part-time",
  INTERNSHIP: "Internship",
  CONTRACT: "Contract",
};
const WORK_MODE_LABEL: Record<WorkMode, string> = {
  ONSITE: "On-site",
  REMOTE: "Remote",
  HYBRID: "Hybrid",
};

export type JobFormDefaults = {
  title: string;
  company: string;
  description: string;
  employmentType: EmploymentType;
  location: string;
  workMode: WorkMode;
  experience: string;
  skills: string[];
  applicationUrl: string;
  deadline: string; // yyyy-mm-dd
};

/** FR-JOB-001/002. One form for both create (`/jobs/new`) and edit (`/jobs/[id]/edit`). */
export function JobForm({
  defaults,
  submitAction,
  submitLabel,
}: {
  defaults?: JobFormDefaults;
  submitAction: (input: unknown) => Promise<ActionResult<unknown>>;
  submitLabel: string;
}) {
  const [title, setTitle] = useState(defaults?.title ?? "");
  const [company, setCompany] = useState(defaults?.company ?? "");
  const [description, setDescription] = useState(defaults?.description ?? "");
  const [employmentType, setEmploymentType] = useState<EmploymentType>(
    defaults?.employmentType ?? "FULL_TIME"
  );
  const [location, setLocation] = useState(defaults?.location ?? "");
  const [workMode, setWorkMode] = useState<WorkMode>(
    defaults?.workMode ?? "ONSITE"
  );
  const [experience, setExperience] = useState(defaults?.experience ?? "");
  const [skills, setSkills] = useState(defaults?.skills.join(", ") ?? "");
  const [applicationUrl, setApplicationUrl] = useState(
    defaults?.applicationUrl ?? ""
  );
  const [deadline, setDeadline] = useState(defaults?.deadline ?? "");

  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await submitAction({
        title,
        company,
        description,
        employmentType,
        location,
        workMode,
        experience,
        skills: skills
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        applicationUrl,
        deadline,
      });
      if (!result.ok) setError(result.error.message);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <label className="block space-y-1.5 text-sm">
        <span className="font-medium">Title</span>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={200}
          required
        />
      </label>
      <label className="block space-y-1.5 text-sm">
        <span className="font-medium">Company</span>
        <Input
          value={company}
          onChange={(e) => setCompany(e.target.value)}
          maxLength={200}
          required
        />
      </label>
      <label className="block space-y-1.5 text-sm">
        <span className="font-medium">Description</span>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={5000}
          required
          className={TEXTAREA_CLASS}
        />
      </label>
      <label className="block space-y-1.5 text-sm">
        <span className="font-medium">Employment type</span>
        <select
          value={employmentType}
          onChange={(e) => setEmploymentType(e.target.value as EmploymentType)}
          className={SELECT_CLASS}
        >
          {EMPLOYMENT_TYPES.map((t) => (
            <option key={t} value={t}>
              {EMPLOYMENT_LABEL[t]}
            </option>
          ))}
        </select>
      </label>
      <label className="block space-y-1.5 text-sm">
        <span className="font-medium">Location</span>
        <Input
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          maxLength={200}
          required
        />
      </label>
      <label className="block space-y-1.5 text-sm">
        <span className="font-medium">Work mode</span>
        <select
          value={workMode}
          onChange={(e) => setWorkMode(e.target.value as WorkMode)}
          className={SELECT_CLASS}
        >
          {WORK_MODES.map((m) => (
            <option key={m} value={m}>
              {WORK_MODE_LABEL[m]}
            </option>
          ))}
        </select>
      </label>
      <label className="block space-y-1.5 text-sm">
        <span className="font-medium">Experience</span>
        <Input
          value={experience}
          onChange={(e) => setExperience(e.target.value)}
          maxLength={200}
          required
        />
      </label>
      <label className="block space-y-1.5 text-sm">
        <span className="font-medium">Skills</span>
        <Input
          value={skills}
          onChange={(e) => setSkills(e.target.value)}
          placeholder="node, postgres, react"
        />
      </label>
      <label className="block space-y-1.5 text-sm">
        <span className="font-medium">Application link</span>
        <Input
          type="url"
          value={applicationUrl}
          onChange={(e) => setApplicationUrl(e.target.value)}
          placeholder="https://…"
          required
        />
      </label>
      <label className="block space-y-1.5 text-sm">
        <span className="font-medium">Deadline</span>
        <input
          type="date"
          value={deadline}
          onChange={(e) => setDeadline(e.target.value)}
          required
          className={SELECT_CLASS}
        />
      </label>
      {error ? (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      ) : null}
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : submitLabel}
      </Button>
    </form>
  );
}
