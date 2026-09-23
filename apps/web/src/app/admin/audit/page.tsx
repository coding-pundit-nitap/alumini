import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { buttonVariants } from "@nitap/ui/components/button";

import { listAuditLog } from "@/composition/admin";
import { AppError } from "@/lib/errors";
import { AuditFilters, AuditTable } from "@/modules/admin";
import { getActor } from "@/modules/auth";

export const metadata: Metadata = { title: "Audit log" };

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
    if (error instanceof AppError && error.code === "VALIDATION_FAILED")
      redirect("/admin/audit");
    throw error;
  }

  const older = page.nextCursor
    ? `/admin/audit?${new URLSearchParams({ ...values, cursor: page.nextCursor })}`
    : null;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Audit log</h1>
      <AuditFilters values={values} />
      <AuditTable rows={page.data} />
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
