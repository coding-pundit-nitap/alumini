import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { approveJobAction, rejectJobAction } from "@/app/(app)/jobs/actions";
import { listPendingJobs } from "@/composition/jobs";
import { AppError } from "@/lib/errors";
import { can, getActor, PERMISSIONS } from "@/modules/auth";
import { ModerationQueue } from "@/modules/jobs";

export const metadata: Metadata = { title: "Job moderation queue" };

const first = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

/** FR-JOB-003 under the admin shell (spec C12-9). 404 without job.approve (AD-5). */
export default async function AdminJobsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const actor = await getActor();
  if (!can(actor, PERMISSIONS.JOB_APPROVE)) notFound();
  const cursor = first((await searchParams).cursor);

  let page;
  try {
    page = await listPendingJobs({ actor, cursor });
  } catch (error) {
    if (error instanceof AppError && error.code === "INVALID_CURSOR")
      redirect("/admin/jobs");
    throw error;
  }

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <h1 className="text-2xl font-semibold">Job moderation queue</h1>
      <ModerationQueue
        items={page.data}
        approveAction={approveJobAction}
        rejectAction={rejectJobAction}
      />
      {page.page.nextCursor ? (
        <Link
          href={`/admin/jobs?cursor=${encodeURIComponent(page.page.nextCursor)}`}
          className="text-sm underline"
        >
          Next
        </Link>
      ) : null}
    </div>
  );
}
