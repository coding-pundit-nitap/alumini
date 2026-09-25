import { PERMISSIONS } from "@nitap/database/permissions";
import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";

import { buttonVariants } from "@nitap/ui/components/button";

import { PageColumns } from "@/components/shell/page-columns";
import { getJob } from "@/composition/jobs";
import { AppError } from "@/lib/errors";
import { can, getActor } from "@/modules/auth";
import { JobForm, STATUS_LABEL } from "@/modules/jobs";

import { editJobAction } from "../../actions";

export const metadata: Metadata = { title: "Edit job posting" };

const uuid = z.uuid();

export default async function EditJobPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const actor = await getActor();
  if (!actor) redirect(`/login?next=%2Fjobs%2F${id}%2Fedit`);
  if (!uuid.safeParse(id).success) notFound();

  let job;
  try {
    job = await getJob({ actor, jobId: id });
  } catch (error) {
    if (error instanceof AppError && error.status === 404) notFound();
    if (error instanceof AppError && error.status === 403) {
      redirect("/account/status");
    }
    throw error;
  }
  // Only the poster or a job.manage holder may edit; approvers can see the job but not change it.
  if (job.postedBy !== actor.userId && !can(actor, PERMISSIONS.JOB_MANAGE)) {
    notFound();
  }
  const locked = job.status === "EXPIRED" || job.status === "CLOSED";

  const defaults = {
    title: job.title,
    company: job.company,
    description: job.description,
    employmentType: job.employmentType,
    location: job.location,
    workMode: job.workMode,
    experience: job.experience,
    skills: job.skills,
    applicationUrl: job.applicationUrl,
    deadline: job.deadline.toISOString().slice(0, 10),
  };

  return (
    <PageColumns
      header={
        <Link
          href={`/jobs/${job.id}`}
          className={buttonVariants({
            variant: "ghost",
            size: "sm",
            className: "-ml-2 rounded-full",
          })}
        >
          <ArrowLeft aria-hidden />
          Back to posting
        </Link>
      }
    >
      <div className="space-y-3 border-b px-4 py-6 sm:px-5">
        <h1 className="text-2xl font-semibold tracking-tight">
          Edit job posting
        </h1>
        <p className="text-muted-foreground text-sm">
          Changing the title, company, description, link or deadline of a
          published job sends it back for review.
        </p>
        {job.status === "REJECTED" && job.reviewNote ? (
          <p className="border-destructive/30 bg-destructive/5 rounded-lg border px-3 py-2 text-sm">
            <span className="text-destructive font-medium">Reviewer note:</span>{" "}
            {job.reviewNote}
          </p>
        ) : null}
      </div>
      {locked ? (
        <p className="text-muted-foreground px-4 py-10 text-center text-sm sm:px-5">
          This posting is {STATUS_LABEL[job.status].toLowerCase()} and can no
          longer be edited.
        </p>
      ) : (
        <JobForm
          jobId={job.id}
          defaults={defaults}
          submitAction={editJobAction.bind(null, id)}
          submitLabel="Save changes"
        />
      )}
    </PageColumns>
  );
}
