import { PERMISSIONS } from "@nitap/database/permissions";
import {
  ArrowLeft,
  Briefcase,
  BriefcaseBusiness,
  MapPin,
  Pencil,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";

import { Badge } from "@nitap/ui/components/badge";
import { buttonVariants } from "@nitap/ui/components/button";

import { PageColumns } from "@/components/shell/page-columns";
import { getJob } from "@/composition/jobs";
import { AppError } from "@/lib/errors";
import { relativeTime } from "@/lib/relative-time";
import { can, getActor } from "@/modules/auth";
import {
  ApplyLink,
  CompanyMark,
  Deadline,
  EMPLOYMENT_LABEL,
  Meta,
  STATUS_LABEL,
  WORK_MODE_LABEL,
} from "@/modules/jobs";

export const metadata: Metadata = { title: "Job" };

const uuid = z.uuid();

/** A posting's full view (spec J-8 visibility: PUBLISHED, or the poster, or an approver/manager; else 404). */
export default async function JobPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const actor = await getActor();
  if (!actor) redirect(`/login?next=${encodeURIComponent(`/jobs/${id}`)}`);
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

  const owns =
    job.postedBy === actor.userId || can(actor, PERMISSIONS.JOB_MANAGE);
  const editable = owns && job.status !== "EXPIRED" && job.status !== "CLOSED";
  const published = job.status === "PUBLISHED";

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
          <span className="flex-1" />
          {editable ? (
            <Link
              href={`/jobs/${job.id}/edit`}
              className={buttonVariants({
                variant: "outline",
                size: "sm",
                className: "rounded-full",
              })}
            >
              <Pencil aria-hidden />
              Edit
            </Link>
          ) : null}
        </>
      }
    >
      <article>
        <header className="space-y-4 border-b px-4 py-6 sm:px-5">
          <CompanyMark company={job.company} className="size-14 text-base" />
          <div className="space-y-1">
            {!published ? (
              <Badge
                variant={
                  job.status === "REJECTED" ? "destructive" : "secondary"
                }
              >
                {STATUS_LABEL[job.status]}
              </Badge>
            ) : null}
            <h1 className="text-2xl font-semibold tracking-tight text-balance">
              {job.title}
            </h1>
            <p className="text-muted-foreground">{job.company}</p>
          </div>
          <p className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-sm">
            <Meta icon={MapPin}>{job.location}</Meta>
            <Meta icon={Briefcase}>
              {EMPLOYMENT_LABEL[job.employmentType]} ·{" "}
              {WORK_MODE_LABEL[job.workMode]}
            </Meta>
            <Meta icon={BriefcaseBusiness}>{job.experience}</Meta>
          </p>
          {owns && job.status === "REJECTED" && job.reviewNote ? (
            <p className="border-destructive/30 bg-destructive/5 text-destructive rounded-lg border px-3 py-2 text-sm">
              Reviewer note: {job.reviewNote}
            </p>
          ) : null}
          <div className="text-muted-foreground flex flex-wrap items-center justify-between gap-3 text-xs">
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span>Posted {relativeTime(job.createdAt)}</span>
              {published ? <Deadline deadline={job.deadline} /> : null}
            </span>
            {published ? <ApplyLink href={job.applicationUrl} /> : null}
          </div>
        </header>

        <section className="space-y-2 border-b px-4 py-6 sm:px-5">
          <h2 className="font-semibold tracking-tight">About the role</h2>
          <p className="text-sm leading-relaxed whitespace-pre-wrap">
            {job.description}
          </p>
        </section>

        {job.skills.length > 0 ? (
          <section className="space-y-3 px-4 py-6 sm:px-5">
            <h2 className="font-semibold tracking-tight">Skills</h2>
            <ul className="flex flex-wrap gap-1.5">
              {job.skills.map((skill) => (
                <li
                  key={skill}
                  className="bg-muted rounded-full px-2.5 py-1 text-xs"
                >
                  {skill}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </article>
    </PageColumns>
  );
}
