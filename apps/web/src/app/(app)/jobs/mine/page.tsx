import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { buttonVariants } from "@nitap/ui/components/button";

import { PageColumns } from "@/components/shell/page-columns";
import { listMyJobs } from "@/composition/jobs";
import { AppError } from "@/lib/errors";
import { getActor } from "@/modules/auth";
import { MyJobsList } from "@/modules/jobs";

import { closeJobAction } from "../actions";

export const metadata: Metadata = { title: "My job postings" };

export default async function MyJobsPage({
  searchParams,
}: {
  searchParams: Promise<{ cursor?: string }>;
}) {
  const { cursor } = await searchParams;
  const actor = await getActor();
  if (!actor) redirect("/login?next=%2Fjobs%2Fmine");

  let page;
  try {
    page = await listMyJobs({ actor, cursor });
  } catch (error) {
    if (error instanceof AppError && error.status === 403) {
      redirect("/account/status");
    }
    if (error instanceof AppError && error.code === "INVALID_CURSOR") {
      redirect("/jobs/mine");
    }
    throw error;
  }
  const next = page.page.nextCursor;

  return (
    <PageColumns
      header={
        <>
          <div className="min-w-0 flex-1 leading-tight">
            <h1 className="truncate font-semibold tracking-tight">
              My job postings
            </h1>
            <p className="text-muted-foreground truncate text-xs">
              Everything you have posted, and where it stands
            </p>
          </div>
          <Link
            href="/jobs/new"
            className={buttonVariants({
              size: "sm",
              className: "rounded-full",
            })}
          >
            <Plus aria-hidden />
            Post a job
          </Link>
        </>
      }
    >
      <MyJobsList
        items={page.data}
        closeAction={closeJobAction}
        nextHref={next ? `/jobs/mine?cursor=${encodeURIComponent(next)}` : null}
      />
    </PageColumns>
  );
}
