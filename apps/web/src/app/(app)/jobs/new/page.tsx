import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getActor } from "@/modules/auth";
import { JobForm } from "@/modules/jobs";

import { createJobAction } from "../actions";

export const metadata: Metadata = { title: "Post a job" };

export default async function NewJobPage() {
  const actor = await getActor();
  if (!actor) redirect("/login?next=%2Fjobs%2Fnew");

  return (
    <div className="mx-auto w-full max-w-xl space-y-6 px-4 py-12">
      <h1 className="text-2xl font-semibold">Post a job or internship</h1>
      <p className="text-muted-foreground text-sm">
        Postings are reviewed before they appear publicly, unless you hold
        moderation rights.
      </p>
      <JobForm submitAction={createJobAction} submitLabel="Post job" />
    </div>
  );
}
