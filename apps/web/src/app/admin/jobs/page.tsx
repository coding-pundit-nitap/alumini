import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { approveJobAction, rejectJobAction } from "@/app/(app)/jobs/actions";
import { AdminPageHeader, AdminPager } from "@/components/admin/admin-surface";
import { listPendingJobs } from "@/composition/jobs";
import { AppError } from "@/lib/errors";
import { can, getActor, PERMISSIONS } from "@/modules/auth";
import { ModerationQueue } from "@/modules/jobs";

export const metadata: Metadata = { title: "Job moderation queue" };

const first = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

/** Under the admin shell. 404 without job.approve. */
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
      <AdminPageHeader
        title="Job moderation queue"
        description="Posts waiting before they go live."
      />
      <ModerationQueue
        items={page.data}
        approveAction={approveJobAction}
        rejectAction={rejectJobAction}
      />
      <AdminPager
        href={
          page.page.nextCursor
            ? `/admin/jobs?cursor=${encodeURIComponent(page.page.nextCursor)}`
            : null
        }
        label="Next"
      />
    </div>
  );
}
