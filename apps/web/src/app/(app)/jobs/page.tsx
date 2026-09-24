import type { Metadata } from "next";
import Link from "next/link";

import { listPublishedJobs } from "@/composition/jobs";
import { getActor } from "@/modules/auth";
import {
  EMPLOYMENT_TYPES,
  JobList,
  WORK_MODES,
  type EmploymentType,
  type WorkMode,
} from "@/modules/jobs";

export const metadata: Metadata = { title: "Jobs & internships" };

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
const SELECT_CLASS =
  "border-input bg-background h-9 rounded-md border px-2 text-sm";

export default async function JobsPage({
  searchParams,
}: {
  searchParams: Promise<{
    employmentType?: string;
    workMode?: string;
    location?: string;
  }>;
}) {
  const { employmentType, workMode, location } = await searchParams;
  const actor = await getActor();
  const page = await listPublishedJobs({
    actor,
    employmentType: (EMPLOYMENT_TYPES as readonly string[]).includes(
      employmentType ?? ""
    )
      ? (employmentType as EmploymentType)
      : undefined,
    workMode: (WORK_MODES as readonly string[]).includes(workMode ?? "")
      ? (workMode as WorkMode)
      : undefined,
    location,
  });

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 px-4 py-12">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Jobs & internships</h1>
        {actor ? (
          <Link href="/jobs/mine" className="text-sm underline">
            My postings
          </Link>
        ) : null}
      </div>
      <form className="flex flex-wrap gap-3" aria-label="Filter jobs">
        <select
          name="employmentType"
          defaultValue={employmentType ?? ""}
          className={SELECT_CLASS}
        >
          <option value="">Any employment type</option>
          {EMPLOYMENT_TYPES.map((t) => (
            <option key={t} value={t}>
              {EMPLOYMENT_LABEL[t]}
            </option>
          ))}
        </select>
        <select
          name="workMode"
          defaultValue={workMode ?? ""}
          className={SELECT_CLASS}
        >
          <option value="">Any work mode</option>
          {WORK_MODES.map((m) => (
            <option key={m} value={m}>
              {WORK_MODE_LABEL[m]}
            </option>
          ))}
        </select>
        <input
          name="location"
          defaultValue={location ?? ""}
          placeholder="Location"
          className={SELECT_CLASS}
        />
        <button type="submit" className="text-sm underline underline-offset-2">
          Apply filters
        </button>
      </form>
      <JobList items={page.data} />
    </div>
  );
}
