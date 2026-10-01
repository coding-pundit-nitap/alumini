"use client";

import { CircleCheck } from "lucide-react";
import Link from "next/link";
import { useId, useState, useTransition, type FormEvent } from "react";

import { Button } from "@nitap/ui/components/button";
import { Input } from "@nitap/ui/components/input";
import { cn } from "@nitap/ui/lib/utils";

import type { ActionResult } from "@/lib/action-result";

import {
  EMPLOYMENT_TYPES,
  WORK_MODES,
  type EmploymentType,
  type WorkMode,
} from "../../domain/job";
import { EMPLOYMENT_LABEL, WORK_MODE_LABEL } from "../labels";

const CONTROL =
  "border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 w-full rounded-lg border px-2.5 text-sm outline-none focus-visible:ring-[3px]";
const MAX_SKILLS = 20;
const MAX_DESCRIPTION = 5000;

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

type Saved = { jobId?: string; status?: string };

const splitSkills = (raw: string) =>
  raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

/** The label sits alone in its <label> so tests and screen readers get the exact name; hints and errors are described-by. */
function Field({
  label,
  hint,
  error,
  className,
  children,
}: {
  label: string;
  hint?: React.ReactNode;
  error?: string;
  className?: string;
  children: (describedBy: string | undefined) => React.ReactNode;
}) {
  const id = useId();
  const describedBy =
    [hint ? `${id}-hint` : null, error ? `${id}-error` : null]
      .filter(Boolean)
      .join(" ") || undefined;
  return (
    <div className={cn("space-y-1.5 text-sm", className)}>
      <label className="block space-y-1.5">
        <span className="font-medium">{label}</span>
        {children(describedBy)}
      </label>
      {hint ? (
        <div id={`${id}-hint`} className="text-muted-foreground text-xs">
          {hint}
        </div>
      ) : null}
      {error ? (
        <p id={`${id}-error`} className="text-destructive text-xs">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <fieldset className="space-y-4 border-b px-4 py-5 sm:px-5">
      <legend className="sr-only">{title}</legend>
      <h2 aria-hidden className="font-semibold tracking-tight">
        {title}
      </h2>
      {children}
    </fieldset>
  );
}

/** FR-JOB-001/002. One form for both create (`/jobs/new`) and edit (`/jobs/[id]/edit`). */
export function JobForm({
  defaults,
  submitAction,
  submitLabel,
  jobId,
}: {
  defaults?: JobFormDefaults;
  submitAction: (input: unknown) => Promise<ActionResult<unknown>>;
  submitLabel: string;
  /** Set when editing: success then says "saved" rather than "posted", and keeps the values. */
  jobId?: string;
}) {
  const editing = jobId !== undefined;
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
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState<Saved | null>(null);

  const skillList = [...new Set(splitSkills(skills))];
  const today = new Date().toISOString().slice(0, 10);

  function reset() {
    setTitle("");
    setCompany("");
    setDescription("");
    setEmploymentType("FULL_TIME");
    setLocation("");
    setWorkMode("ONSITE");
    setExperience("");
    setSkills("");
    setApplicationUrl("");
    setDeadline("");
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setFieldErrors({});
    setSaved(null);
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
      if (!result.ok) {
        setError(result.error.message);
        // "skills.3" belongs to the Skills field; the first message per field wins.
        const byField: Record<string, string> = {};
        for (const [path, message] of Object.entries(
          result.error.fields ?? {}
        )) {
          byField[path.split(".")[0]!] ??= message;
        }
        setFieldErrors(byField);
        return;
      }
      setSaved((result.data ?? {}) as Saved);
      if (!editing) reset();
    });
  }

  const savedId = saved?.jobId ?? jobId;
  const live = saved?.status === "PUBLISHED";

  return (
    <form method="post" onSubmit={handleSubmit}>
      {saved ? (
        <div
          role="status"
          className="border-success/30 bg-success/8 mx-4 mt-5 flex gap-3 rounded-xl border p-4 text-sm sm:mx-5"
        >
          <CircleCheck aria-hidden className="text-success size-5 shrink-0" />
          <div className="space-y-2">
            <p className="font-medium">
              {editing
                ? live || saved.status !== "PENDING_REVIEW"
                  ? "Changes saved."
                  : "Saved and sent back for review."
                : live
                  ? "Your posting is live."
                  : "Sent for review. It appears on the board once approved."}
            </p>
            <p className="flex gap-4">
              {savedId ? (
                <Link
                  href={`/jobs/${savedId}`}
                  className="font-medium underline underline-offset-2"
                >
                  View posting
                </Link>
              ) : null}
              <Link
                href="/jobs/mine"
                className="font-medium underline underline-offset-2"
              >
                My postings
              </Link>
            </p>
          </div>
        </div>
      ) : null}

      <Section title="The role">
        <Field label="Title" error={fieldErrors.title}>
          {(d) => (
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              required
              placeholder="Backend Engineer"
              aria-describedby={d}
              aria-invalid={!!fieldErrors.title || undefined}
            />
          )}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Company"
            error={fieldErrors.company}
            className="sm:col-span-2"
          >
            {(d) => (
              <Input
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                maxLength={200}
                required
                aria-describedby={d}
                aria-invalid={!!fieldErrors.company || undefined}
              />
            )}
          </Field>
          <Field label="Employment type">
            {() => (
              <select
                value={employmentType}
                onChange={(e) =>
                  setEmploymentType(e.target.value as EmploymentType)
                }
                className={cn(CONTROL, "h-9")}
              >
                {EMPLOYMENT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {EMPLOYMENT_LABEL[t]}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field label="Work mode">
            {() => (
              <select
                value={workMode}
                onChange={(e) => setWorkMode(e.target.value as WorkMode)}
                className={cn(CONTROL, "h-9")}
              >
                {WORK_MODES.map((m) => (
                  <option key={m} value={m}>
                    {WORK_MODE_LABEL[m]}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field
            label="Location"
            hint="City or “Remote”. The board filters by exact location."
            error={fieldErrors.location}
          >
            {(d) => (
              <Input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                maxLength={200}
                required
                aria-describedby={d}
                aria-invalid={!!fieldErrors.location || undefined}
              />
            )}
          </Field>
          <Field
            label="Experience"
            hint="For example “0–1 years” or “Final-year students”."
            error={fieldErrors.experience}
          >
            {(d) => (
              <Input
                value={experience}
                onChange={(e) => setExperience(e.target.value)}
                maxLength={200}
                required
                aria-describedby={d}
                aria-invalid={!!fieldErrors.experience || undefined}
              />
            )}
          </Field>
        </div>
      </Section>

      <Section title="Details">
        <Field
          label="Description"
          hint={
            <span className="flex justify-between gap-3">
              <span>What the work is, who it suits, and how to apply.</span>
              <span className="tabular-nums">
                {description.length} / {MAX_DESCRIPTION}
              </span>
            </span>
          }
          error={fieldErrors.description}
        >
          {(d) => (
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={MAX_DESCRIPTION}
              required
              rows={8}
              aria-describedby={d}
              aria-invalid={!!fieldErrors.description || undefined}
              className={cn(CONTROL, "min-h-40 py-2 leading-relaxed")}
            />
          )}
        </Field>
        <Field
          label="Skills"
          hint={
            skillList.length ? (
              <span className="flex flex-wrap items-center gap-1.5">
                {skillList.slice(0, MAX_SKILLS).map((skill) => (
                  <span
                    key={skill}
                    className="bg-muted text-foreground rounded-full px-2 py-0.5"
                  >
                    {skill}
                  </span>
                ))}
                {skillList.length > MAX_SKILLS ? (
                  <span className="text-destructive">
                    Only {MAX_SKILLS} skills are allowed.
                  </span>
                ) : null}
              </span>
            ) : (
              "Separate with commas. Up to 20."
            )
          }
          error={fieldErrors.skills}
        >
          {(d) => (
            <Input
              value={skills}
              onChange={(e) => setSkills(e.target.value)}
              placeholder="node, postgres, react"
              aria-describedby={d}
              aria-invalid={!!fieldErrors.skills || undefined}
            />
          )}
        </Field>
      </Section>

      <Section title="Applying">
        <div className="grid gap-4 sm:grid-cols-[1fr_12rem]">
          <Field
            label="Application link"
            hint="Must start with https://"
            error={fieldErrors.applicationUrl}
          >
            {(d) => (
              <Input
                type="url"
                value={applicationUrl}
                onChange={(e) => setApplicationUrl(e.target.value)}
                placeholder="https://…"
                required
                aria-describedby={d}
                aria-invalid={!!fieldErrors.applicationUrl || undefined}
              />
            )}
          </Field>
          <Field
            label="Deadline"
            hint="Leaves the board after this day."
            error={fieldErrors.deadline}
          >
            {(d) => (
              <input
                type="date"
                value={deadline}
                min={editing ? undefined : today}
                onChange={(e) => setDeadline(e.target.value)}
                required
                aria-describedby={d}
                aria-invalid={!!fieldErrors.deadline || undefined}
                className={cn(CONTROL, "h-9")}
              />
            )}
          </Field>
        </div>
      </Section>

      <div className="flex flex-col-reverse items-stretch gap-3 px-4 py-5 sm:flex-row sm:items-center sm:justify-end sm:px-5">
        {error ? (
          <p role="alert" className="text-destructive text-sm sm:mr-auto">
            {error}
          </p>
        ) : null}
        <Button type="submit" disabled={pending} className="rounded-full px-6">
          {pending ? "Saving…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}
