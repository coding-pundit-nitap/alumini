import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { getJob } from "@/composition/jobs";
import { AppError } from "@/lib/errors";
import { getActor } from "@/modules/auth";
import { JobForm } from "@/modules/jobs";

import { editJobAction } from "../../actions";

export const metadata: Metadata = { title: "Edit job posting" };

export default async function EditJobPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const actor = await getActor();
  if (!actor) redirect(`/login?next=%2Fjobs%2F${id}%2Fedit`);

  const job = await getJob({ actor, jobId: id }).catch((error) => {
    if (error instanceof AppError && error.code === "NOT_FOUND") return null;
    throw error;
  });
  if (!job) notFound();

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
    <div className="mx-auto w-full max-w-xl space-y-6 px-4 py-12">
      <h1 className="text-2xl font-semibold">Edit job posting</h1>
      <JobForm
        defaults={defaults}
        submitAction={editJobAction.bind(null, id)}
        submitLabel="Save changes"
      />
    </div>
  );
}
