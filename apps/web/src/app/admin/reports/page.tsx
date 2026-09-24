import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@nitap/ui/components/alert";
import { buttonVariants } from "@nitap/ui/components/button";

import { listReports } from "@/composition/moderation";
import { AppError } from "@/lib/errors";
import {
  REPORT_FILTER_LABELS,
  ReportFilters,
  ReportsTable,
} from "@/modules/moderation";
import { getActor } from "@/modules/auth";

export const metadata: Metadata = { title: "Reports" };

/** The labels of the fields a VALIDATION_FAILED names, for the inline error. */
function invalidFields(error: AppError): string[] {
  const fields = (error.details ?? []).map((d) => {
    const field = (d as { field?: string }).field ?? "";
    return REPORT_FILTER_LABELS[field] ?? `Unknown filter "${field}"`;
  });
  return [...new Set(fields)];
}

const first = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const values: Record<string, string> = {};
  for (const [key, value] of Object.entries(await searchParams)) {
    const v = first(value);
    if (v !== undefined) values[key] = v;
  }

  let page;
  let invalid: string[] | null = null;
  try {
    page = await listReports({ actor: await getActor(), query: values });
  } catch (error) {
    if (error instanceof AppError && error.status === 404) notFound();
    // A stale or tampered cursor: start again from the newest report, keeping the filters.
    if (error instanceof AppError && error.code === "INVALID_CURSOR") {
      const filters = new URLSearchParams(values);
      filters.delete("cursor");
      redirect(`/admin/reports?${filters}`);
    }
    // Keep what the moderator picked and say what is wrong, rather than silently resetting the filters.
    if (error instanceof AppError && error.code === "VALIDATION_FAILED")
      invalid = invalidFields(error);
    else throw error;
  }

  const next = page?.nextCursor;
  const older = next
    ? `/admin/reports?${new URLSearchParams({ ...values, cursor: next })}`
    : null;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Reports</h1>
      <ReportFilters values={values} />
      {invalid ? (
        <Alert variant="destructive">
          <AlertTitle>These filters are not valid</AlertTitle>
          <AlertDescription>Check {invalid.join(", ")}.</AlertDescription>
        </Alert>
      ) : (
        <ReportsTable rows={page?.data ?? []} />
      )}
      {older ? (
        <Link
          href={older}
          className={buttonVariants({
            variant: "outline",
            className: "self-start",
          })}
        >
          Older reports
        </Link>
      ) : null}
    </div>
  );
}
