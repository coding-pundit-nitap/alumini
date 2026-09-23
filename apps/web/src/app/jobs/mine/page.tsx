import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { listMyJobs } from "@/composition/jobs";
import { getActor } from "@/modules/auth";
import { MyJobsList, WithdrawButton } from "@/modules/jobs";

import { closeJobAction } from "../actions";

export const metadata: Metadata = { title: "My job postings" };

export default async function MyJobsPage() {
  const actor = await getActor();
  if (!actor) redirect("/login?next=%2Fjobs%2Fmine");

  const page = await listMyJobs({ actor });

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6 px-4 py-12">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">My job postings</h1>
        <Link href="/jobs/new" className="text-sm underline">
          Post a job
        </Link>
      </div>
      <MyJobsList
        items={page.data}
        withdrawSlot={(job) =>
          job.status === "PENDING_REVIEW" || job.status === "PUBLISHED" ? (
            <WithdrawButton jobId={job.id} closeAction={closeJobAction} />
          ) : null
        }
      />
    </div>
  );
}
