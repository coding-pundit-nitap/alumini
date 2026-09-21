import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { InvalidCursorError, parseDirectoryQuery } from "@nitap/search";

import { listDepartments, searchDirectory } from "@/composition/directory";
import { AppError } from "@/lib/errors";
import { getActor } from "@/modules/auth";
import { AlumniList, DirectoryFilters } from "@/modules/directory";

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

  // The next page keeps every filter; only the cursor changes.
  const next = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (key === "cursor") continue;
    for (const v of Array.isArray(value) ? value : value ? [value] : []) {
      next.append(key, v);
    }
  }
  if (page?.page.nextCursor) next.set("cursor", page.page.nextCursor);

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 px-4 py-12">
      <h1 className="text-2xl font-semibold">Alumni directory</h1>
      <DirectoryFilters
        query={parsed.ok ? parsed.query : {}}
        departments={departments}
      />
      {problem ? (
        <p role="alert" className="text-destructive text-sm">
          {problem}
        </p>
      ) : null}
      {page ? <AlumniList people={page.data} /> : null}
      {page?.page.hasMore ? (
        <Link
          href={`/directory?${next.toString()}`}
          className="text-primary block text-center text-sm underline"
        >
          Next page
        </Link>
      ) : null}
    </div>
  );
}
