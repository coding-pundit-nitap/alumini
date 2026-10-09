import { UsersRound } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { InvalidCursorError, parseDirectoryQuery } from "@nitap/search";

import { buttonVariants } from "@nitap/ui/components/button";

import { PageColumns } from "@/components/shell/page-columns";
import { listDepartments, searchDirectory } from "@/composition/directory";
import { AppError } from "@/lib/errors";
import { getActor } from "@/modules/auth";
import {
  AlumniList,
  clearFiltersHref,
  DirectoryFilters,
} from "@/modules/directory";

export const metadata: Metadata = { title: "Alumni directory" };

export default async function DirectoryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const actor = await getActor();
  if (!actor) redirect("/login?next=%2Fdirectory");

  const parsed = parseDirectoryQuery(params);
  const departments = await listDepartments();

  let problem: string | null = null;
  let page = null;
  if (!parsed.ok) {
    problem = parsed.problems[0]?.message ?? "Check the search filters.";
  } else {
    try {
      page = await searchDirectory({ actor, query: parsed.query });
    } catch (error) {
      if (error instanceof InvalidCursorError) {
        problem = "That page link has expired. Start again.";
      } else if (error instanceof AppError && error.status === 429) {
        problem = "Too many searches. Wait a minute and try again.";
      } else if (error instanceof AppError && error.status === 403) {
        redirect("/account/status");
      } else {
        throw error;
      }
    }
  }

  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (key === "cursor") continue;
    for (const v of Array.isArray(value) ? value : value ? [value] : []) {
      search.append(key, v);
    }
  }
  const nextCursor = page?.page.nextCursor ?? null;
  const nextHref = nextCursor
    ? `/directory?${new URLSearchParams([...search, ["cursor", nextCursor]])}`
    : null;

  return (
    <PageColumns
      header={
        <>
          <div className="min-w-0 flex-1 leading-tight">
            <h1 className="truncate font-semibold tracking-tight">
              Alumni directory
            </h1>
            <p className="text-muted-foreground truncate text-xs">
              Find batchmates, seniors and juniors from NIT Arunachal Pradesh
            </p>
          </div>
          <Link
            href="/connections"
            className={buttonVariants({
              variant: "outline",
              size: "sm",
              className: "rounded-full",
            })}
          >
            <UsersRound aria-hidden />
            Your connections
          </Link>
        </>
      }
    >
      <DirectoryFilters
        params={params}
        departments={departments}
        open={!parsed.ok}
      />
      {problem ? (
        <p
          role="alert"
          className="border-destructive/30 bg-destructive/5 text-destructive mx-4 mt-4 rounded-lg border px-3 py-2 text-sm sm:mx-5"
        >
          {problem}
        </p>
      ) : null}
      {page ? (
        <AlumniList
          // A new search starts a fresh list (and drops any pages loaded in place).
          key={search.toString()}
          people={page.data}
          viewerId={actor.userId}
          query={search.toString()}
          nextCursor={nextCursor}
          nextHref={nextHref}
          clearHref={clearFiltersHref(params)}
        />
      ) : null}
    </PageColumns>
  );
}
