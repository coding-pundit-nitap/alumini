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
import { listUsers } from "@/composition/admin";
import { ROLE_NAMES } from "@/infrastructure/role-permissions";
import { AppError } from "@/lib/errors";
import { USER_FILTER_LABELS, UserFilters, UsersTable } from "@/modules/admin";
import { getActor } from "@/modules/auth";

export const metadata: Metadata = { title: "Users" };

/** The labels of the fields a VALIDATION_FAILED names, for the inline error. */
function invalidFields(error: AppError): string[] {
  const fields = (error.details ?? []).map((d) => {
    const field = (d as { field?: string }).field ?? "";
    return USER_FILTER_LABELS[field] ?? `Unknown filter "${field}"`;
  });
  return [...new Set(fields)];
}

const first = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const values: Record<string, string> = {};
  for (const [key, value] of Object.entries(await searchParams)) {
    const v = first(value);
    // An empty select ("Any") is no filter at all.
    if (v !== undefined && v !== "") values[key] = v;
  }

  let page;
  let invalid: string[] | null = null;
  try {
    page = await listUsers({ actor: await getActor(), query: values });
  } catch (error) {
    if (error instanceof AppError && error.status === 404) notFound();
    // A stale or tampered cursor: start again from the newest user, keeping the filters.
    if (error instanceof AppError && error.code === "INVALID_CURSOR") {
      const filters = new URLSearchParams(values);
      filters.delete("cursor");
      redirect(`/admin/users?${filters}`);
    }
    if (error instanceof AppError && error.code === "VALIDATION_FAILED")
      invalid = invalidFields(error);
    else throw error;
  }

  const next = page?.nextCursor;
  const more = next
    ? `/admin/users?${new URLSearchParams({ ...values, cursor: next })}`
    : null;

  return (
    <div className="flex flex-col gap-6">
      <AdminPageHeader
        title="Users"
        description="Everyone with an account, by newest first."
      />
      <AdminPanel toolbar={<UserFilters values={values} roles={ROLE_NAMES} />}>
        {invalid ? (
          <Alert variant="destructive" className="m-4">
            <AlertTitle>These filters are not valid</AlertTitle>
            <AlertDescription>Check {invalid.join(", ")}.</AlertDescription>
          </Alert>
        ) : (
          <UsersTable rows={page?.data ?? []} />
        )}
      </AdminPanel>
      <AdminPager href={more} label="More users" />
    </div>
  );
}
