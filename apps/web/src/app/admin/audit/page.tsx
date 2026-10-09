import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@nitap/ui/components/alert";

import {
  AdminPageHeader,
  AdminPager,
  AdminPanel,
} from "@/components/admin/admin-surface";
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
    if (error instanceof AppError && error.code === "INVALID_CURSOR") {
      const filters = new URLSearchParams(values);
      filters.delete("cursor");
      redirect(`/admin/audit?${filters}`);
    }
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
      <AdminPageHeader
        title="Audit log"
        description="Every sensitive change, who made it and when."
      />
      <AdminPanel toolbar={<AuditFilters values={values} />}>
        {invalid ? (
          <div className="p-4">
            <Alert variant="destructive">
              <AlertTitle>These filters are not valid</AlertTitle>
              <AlertDescription>
                Check {invalid.join(", ")}. Ids are UUIDs, actions look like
                job.approved, and From must be before To.
              </AlertDescription>
            </Alert>
          </div>
        ) : (
          <AuditTable rows={page?.data ?? []} />
        )}
      </AdminPanel>
      <AdminPager href={older} label="Older entries" />
    </div>
  );
}
