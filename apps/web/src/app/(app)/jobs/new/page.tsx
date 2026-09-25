import { PERMISSIONS } from "@nitap/database/permissions";
import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { buttonVariants } from "@nitap/ui/components/button";

import { PageColumns } from "@/components/shell/page-columns";
import { can, getActor } from "@/modules/auth";
import { JobForm } from "@/modules/jobs";

import { createJobAction } from "../actions";

export const metadata: Metadata = { title: "Post a job" };

export default async function NewJobPage() {
  const actor = await getActor();
  if (!actor) redirect("/login?next=%2Fjobs%2Fnew");

  return (
    <PageColumns
      header={
        <>
          <Link
            href="/jobs"
            className={buttonVariants({
              variant: "ghost",
              size: "sm",
              className: "-ml-2 rounded-full",
            })}
          >
            <ArrowLeft aria-hidden />
            Jobs
          </Link>
        </>
      }
    >
      <div className="space-y-1 border-b px-4 py-6 sm:px-5">
        <h1 className="text-2xl font-semibold tracking-tight">
          Post a job or internship
        </h1>
        <p className="text-muted-foreground text-sm">
          Postings are reviewed before they appear publicly, unless you hold
          moderation rights.
        </p>
      </div>
      {can(actor, PERMISSIONS.JOB_CREATE) ? (
        <JobForm submitAction={createJobAction} submitLabel="Post job" />
      ) : (
        <p className="text-muted-foreground px-4 py-10 text-center text-sm sm:px-5">
          Only alumni and the placement cell can post jobs.
        </p>
      )}
    </PageColumns>
  );
}
