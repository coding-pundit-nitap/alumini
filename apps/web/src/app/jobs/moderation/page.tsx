import { PERMISSIONS } from "@nitap/database/permissions";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { listPendingJobs } from "@/composition/jobs";
import { can, getActor } from "@/modules/auth";
import { ModerationQueue } from "@/modules/jobs";

import { approveJobAction, rejectJobAction } from "../actions";

export const metadata: Metadata = { title: "Job moderation queue" };

export default async function JobModerationPage() {
  const actor = await getActor();
  if (!actor) redirect("/login?next=%2Fjobs%2Fmoderation");
  if (!can(actor, PERMISSIONS.JOB_APPROVE)) redirect("/jobs");

  const page = await listPendingJobs({ actor });

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6 px-4 py-12">
      <h1 className="text-2xl font-semibold">Job moderation queue</h1>
      <ModerationQueue
        items={page.data}
        approveAction={approveJobAction}
        rejectAction={rejectJobAction}
      />
    </div>
  );
}
