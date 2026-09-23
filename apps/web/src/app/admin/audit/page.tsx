import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@nitap/ui/components/alert";
import { buttonVariants } from "@nitap/ui/components/button";

import { listAuditLog } from "@/composition/admin";
import { AppError } from "@/lib/errors";
import { AUDIT_FILTER_LABELS, AuditFilters, AuditTable } from "@/modules/admin";
import { getActor } from "@/modules/auth";

export const metadata: Metadata = { title: "Audit log" };

/** The labels of the fields a VALIDATION_FAILED names, for the inline error. */
function invalidFields(error: AppError): string[] {
  const fields = (error.details ?? []).map((d) => {
    const field = (d as { field?: string }).field ?? "";
    return AUDIT_FILTER_LABELS[field] ?? `Unknown filter "${field}"`;
  });
  return [...new Set(fields)];
}

const first = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

export default async function AuditLogPage({
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
    page = await listAuditLog({ actor: await getActor(), query: values });
  } catch (error) {
    if (error instanceof AppError && error.status === 404) notFound();
    // A stale or tampered cursor: start again from the newest entry, keeping the filters.
    if (error instanceof AppError && error.code === "INVALID_CURSOR") {
      const filters = new URLSearchParams(values);
      filters.delete("cursor");
      redirect(`/admin/audit?${filters}`);
    }
    // Keep what the admin typed and say what is wrong, rather than silently resetting the filters.
    if (error instanceof AppError && error.code === "VALIDATION_FAILED")
      invalid = invalidFields(error);
    else throw error;
  }

  const next = page?.nextCursor;
  const older = next
    ? `/admin/audit?${new URLSearchParams({ ...values, cursor: next })}`
    : null;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Audit log</h1>
      <AuditFilters values={values} />
      {invalid ? (
        <Alert variant="destructive">
          <AlertTitle>These filters are not valid</AlertTitle>
          <AlertDescription>
            Check {invalid.join(", ")}. Ids are UUIDs, actions look like
            job.approved, and From must be before To.
          </AlertDescription>
        </Alert>
      ) : (
        <AuditTable rows={page?.data ?? []} />
      )}
      {older ? (
        <Link
          href={older}
          className={buttonVariants({
            variant: "outline",
            className: "self-start",
          })}
        >
          Older entries
        </Link>
      ) : null}
    </div>
  );
}
