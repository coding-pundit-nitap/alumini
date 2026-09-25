import { PERMISSIONS } from "@nitap/database/permissions";
import { FileText, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { buttonVariants } from "@nitap/ui/components/button";

import { PageColumns } from "@/components/shell/page-columns";
import { listPublishedJobs } from "@/composition/jobs";
import { AppError } from "@/lib/errors";
import { can, getActor } from "@/modules/auth";
import {
  EMPLOYMENT_TYPES,
  JobFilters,
  JobList,
  jobsHref,
  WORK_MODES,
  type EmploymentType,
  type JobFilterValues,
  type WorkMode,
} from "@/modules/jobs";

export const metadata: Metadata = { title: "Jobs & internships" };

export default async function JobsPage({
  searchParams,
}: {
  searchParams: Promise<{
    employmentType?: string;
    workMode?: string;
    location?: string;
    cursor?: string;
  }>;
}) {
  const { employmentType, workMode, location, cursor } = await searchParams;
  const actor = await getActor();
  if (!actor) redirect("/login?next=%2Fjobs");

  // Unknown enum values in the URL are ignored.
  const filters: JobFilterValues = {
    employmentType: (EMPLOYMENT_TYPES as readonly string[]).includes(
      employmentType ?? ""
    )
      ? (employmentType as EmploymentType)
      : undefined,
    workMode: (WORK_MODES as readonly string[]).includes(workMode ?? "")
      ? (workMode as WorkMode)
      : undefined,
    location: location?.trim() || undefined,
  };

  let page;
  try {
    page = await listPublishedJobs({ actor, ...filters, cursor });
  } catch (error) {
    if (error instanceof AppError && error.status === 403) {
      redirect("/account/status");
    }
    if (error instanceof AppError && error.code === "INVALID_CURSOR") {
      redirect(jobsHref(filters));
    }
    throw error;
  }

  const base = jobsHref(filters);
  const query = base.split("?")[1] ?? "";
  const nextCursor = page.page.nextCursor;
  const nextHref = nextCursor
    ? `${base}${query ? "&" : "?"}cursor=${encodeURIComponent(nextCursor)}`
    : null;
  const canCreate = can(actor, PERMISSIONS.JOB_CREATE);

  return (
    <PageColumns
      header={
        <>
          <div className="min-w-0 flex-1 leading-tight">
            <h1 className="truncate font-semibold tracking-tight">
              Jobs & internships
            </h1>
            <p className="text-muted-foreground truncate text-xs">
              Roles shared by alumni and the placement cell
            </p>
          </div>
          <Link
            href="/jobs/mine"
            aria-label="My postings"
            className={buttonVariants({
              variant: "outline",
              size: "sm",
              className: "rounded-full",
            })}
          >
            <FileText aria-hidden />
            <span className="hidden sm:inline">My postings</span>
          </Link>
          {canCreate ? (
            <Link
              href="/jobs/new"
              className={buttonVariants({
                size: "sm",
                className: "rounded-full",
              })}
            >
              <Plus aria-hidden />
              Post a job
            </Link>
          ) : null}
        </>
      }
    >
      <JobFilters filters={filters} />
      <JobList
        // New filters start a fresh list (and drop any pages loaded in place).
        key={query}
        items={page.data}
        query={query}
        nextCursor={nextCursor}
        nextHref={nextHref}
        clearHref={base === "/jobs" ? null : "/jobs"}
        canCreate={canCreate}
      />
    </PageColumns>
  );
}
