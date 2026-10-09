"use client";

import { Briefcase, BriefcaseBusiness, Loader2, MapPin } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { buttonVariants } from "@nitap/ui/components/button";

import { relativeTime } from "@/lib/relative-time";

import type { PublishedJobCard } from "../../application/job-queries";
import type { JobsPage } from "../../application/list-my-jobs";
import { EMPLOYMENT_LABEL, WORK_MODE_LABEL } from "../labels";
import { ApplyLink, CompanyMark, Deadline, Meta } from "./job-parts";

const SKILLS_SHOWN = 5;

function Job({ job }: { job: PublishedJobCard }) {
  const extra = job.skills.length - SKILLS_SHOWN;
  return (
    <li className="group hover:bg-muted/30 relative flex gap-3 px-4 py-4 transition-colors sm:px-5">
      <CompanyMark company={job.company} />
      <div className="min-w-0 flex-1 space-y-2">
        <div className="leading-tight">
          <h2 className="font-medium">
            {/* The stretched link makes the whole row open the job; Apply sits above it. */}
            <Link
              href={`/jobs/${job.id}`}
              className="underline-offset-2 outline-none group-hover:underline after:absolute after:inset-0 focus-visible:underline"
            >
              {job.title}
            </Link>
          </h2>
          <p className="text-muted-foreground text-sm">{job.company}</p>
        </div>
        <p className="text-muted-foreground flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
          <Meta icon={MapPin}>{job.location}</Meta>
          <Meta icon={Briefcase}>
            {EMPLOYMENT_LABEL[job.employmentType]} ·{" "}
            {WORK_MODE_LABEL[job.workMode]}
          </Meta>
          <Meta icon={BriefcaseBusiness}>{job.experience}</Meta>
        </p>
        <p className="text-muted-foreground line-clamp-2 text-sm">
          {job.description}
        </p>
        {job.skills.length > 0 ? (
          <ul aria-label="Skills" className="flex flex-wrap gap-1.5">
            {job.skills.slice(0, SKILLS_SHOWN).map((skill) => (
              <li
                key={skill}
                className="bg-muted rounded-full px-2 py-0.5 text-xs"
              >
                {skill}
              </li>
            ))}
            {extra > 0 ? (
              <li className="text-muted-foreground px-1 py-0.5 text-xs">
                +{extra}
              </li>
            ) : null}
          </ul>
        ) : null}
        <div className="text-muted-foreground flex items-center justify-between gap-3 pt-1 text-xs">
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span suppressHydrationWarning>
              Posted {relativeTime(job.createdAt)}
            </span>
            <Deadline deadline={job.deadline} />
          </span>
          <ApplyLink href={job.applicationUrl} className="relative z-[1]" />
        </div>
      </div>
    </li>
  );
}

/** JSON sends dates as strings. */
const revive = (job: PublishedJobCard): PublishedJobCard => ({
  ...job,
  deadline: new Date(job.deadline),
  createdAt: new Date(job.createdAt),
});

/**
 * PUBLISHED, unexpired postings anyone with job.read may browse. The server renders
 * the first page; later pages load from `GET /api/v1/jobs` (same `query`, plus the cursor) as you scroll or press
 * "Load more", which is a plain link to `nextHref` without JS.
 */
export function JobList({
  items,
  query,
  nextCursor: firstCursor = null,
  nextHref = null,
  clearHref = null,
  canCreate = false,
}: {
  items: PublishedJobCard[];
  /** The filters without `cursor`; omit to disable loading more in place. */
  query?: string;
  nextCursor?: string | null;
  nextHref?: string | null;
  /** Shown on the empty state when filters are set. */
  clearHref?: string | null;
  /** Offers "Post a job" on an unfiltered empty board. */
  canCreate?: boolean;
}) {
  const [more, setMore] = useState<PublishedJobCard[]>([]);
  const [cursor, setCursor] = useState(firstCursor);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  const loadMore = useCallback(async () => {
    if (!cursor || query === undefined || loading) return;
    setLoading(true);
    setFailed(false);
    try {
      const params = new URLSearchParams(query);
      params.set("cursor", cursor);
      const res = await fetch(`/api/v1/jobs?${params}`);
      if (!res.ok) throw new Error(String(res.status));
      const page = (await res.json()) as JobsPage<PublishedJobCard>;
      setMore((previous) => [...previous, ...page.data.map(revive)]);
      setCursor(page.page.nextCursor);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [cursor, loading, query]);

  useEffect(() => {
    const el = moreRef.current;
    if (!el || failed || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) void loadMore();
      },
      { rootMargin: "0px 0px 600px 0px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [loadMore, failed]);

  const seen = new Set<string>();
  const all = [...items, ...more].filter(
    (j) => !seen.has(j.id) && seen.add(j.id)
  );

  if (all.length === 0) {
    const cta = clearHref
      ? { href: clearHref, label: "Clear filters" }
      : canCreate
        ? { href: "/jobs/new", label: "Post a job" }
        : null;
    return (
      <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
        <span className="bg-muted text-muted-foreground flex size-12 items-center justify-center rounded-full">
          <BriefcaseBusiness aria-hidden className="size-5" />
        </span>
        <p className="text-muted-foreground max-w-xs text-sm">
          No open postings match yet.
        </p>
        {cta ? (
          <Link
            href={cta.href}
            className={buttonVariants({
              variant: "outline",
              size: "sm",
              className: "rounded-full",
            })}
          >
            {cta.label}
          </Link>
        ) : null}
      </div>
    );
  }

  return (
    <div>
      <ul className="divide-border divide-y">
        {all.map((job) => (
          <Job key={job.id} job={job} />
        ))}
      </ul>
      {cursor ? (
        <div
          ref={moreRef}
          className="flex flex-col items-center gap-1 border-t py-4"
        >
          {loading ? (
            <Loader2
              aria-label="Loading more"
              className="text-muted-foreground size-5 animate-spin"
            />
          ) : nextHref ? (
            <>
              {failed ? (
                <p className="text-muted-foreground text-xs">
                  Couldn&apos;t load more.
                </p>
              ) : null}
              {/* A real link, so paging works without JS; with JS it appends in place instead. */}
              <Link
                href={nextHref}
                className={buttonVariants({
                  variant: "ghost",
                  size: "sm",
                  className: "text-muted-foreground rounded-full",
                })}
                onClick={(event) => {
                  if (query === undefined) return;
                  event.preventDefault();
                  void loadMore();
                }}
              >
                {failed ? "Try again" : "Load more"}
              </Link>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
