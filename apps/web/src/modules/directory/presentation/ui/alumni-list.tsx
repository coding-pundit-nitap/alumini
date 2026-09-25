"use client";

import {
  Briefcase,
  ChevronRight,
  GraduationCap,
  Loader2,
  MapPin,
  SearchX,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { Badge } from "@nitap/ui/components/badge";
import { buttonVariants } from "@nitap/ui/components/button";
import { InitialsAvatar } from "@nitap/ui/components/initials-avatar";

import type {
  AlumniSummary,
  DirectoryPage,
} from "../../application/search-directory";

function Meta({
  icon: Icon,
  children,
}: {
  icon: typeof MapPin;
  children: React.ReactNode;
}) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1">
      <Icon aria-hidden className="size-3.5 shrink-0" />
      <span className="truncate">{children}</span>
    </span>
  );
}

function Person({ person, isYou }: { person: AlumniSummary; isYou: boolean }) {
  const work = [person.currentDesignation, person.currentCompany]
    .filter(Boolean)
    .join(" at ");
  const batch = [
    person.department,
    person.graduationYear
      ? `'${String(person.graduationYear).slice(-2)}`
      : null,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <li>
      <Link
        href={`/members/${person.id}`}
        className="group hover:bg-muted/30 focus-visible:bg-muted/40 flex items-center gap-3 px-4 py-3.5 transition-colors outline-none sm:px-5"
      >
        <InitialsAvatar
          name={person.fullName}
          seed={person.id}
          src={person.photoUrl}
          size="lg"
          className="size-11"
        />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="truncate font-medium underline-offset-2 group-hover:underline">
              {person.fullName}
            </span>
            {isYou ? <Badge variant="brand">You</Badge> : null}
          </span>
          {person.headline ? (
            <span className="text-muted-foreground block truncate text-sm">
              {person.headline}
            </span>
          ) : null}
          {work || batch || person.location ? (
            <span className="text-muted-foreground mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
              {work ? <Meta icon={Briefcase}>{work}</Meta> : null}
              {batch ? <Meta icon={GraduationCap}>{batch}</Meta> : null}
              {person.location ? (
                <Meta icon={MapPin}>{person.location}</Meta>
              ) : null}
            </span>
          ) : null}
        </span>
        <ChevronRight
          aria-hidden
          className="text-muted-foreground size-4 shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
        />
      </Link>
    </li>
  );
}

/**
 * Directory results. The server renders the first page; later pages load from `GET /api/v1/alumni` (same
 * `query`, plus the cursor) as you scroll or press "Load more", which is a plain link to `nextHref` without JS.
 */
export function AlumniList({
  people,
  viewerId,
  query,
  nextCursor: firstCursor = null,
  nextHref = null,
  clearHref = null,
}: {
  people: AlumniSummary[];
  viewerId?: string;
  /** The search's params without `cursor`; omit to disable loading more in place. */
  query?: string;
  nextCursor?: string | null;
  nextHref?: string | null;
  /** Shown on the empty state when filters are set. */
  clearHref?: string | null;
}) {
  const [more, setMore] = useState<AlumniSummary[]>([]);
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
      const res = await fetch(`/api/v1/alumni?${params}`);
      if (!res.ok) throw new Error(String(res.status));
      const page = (await res.json()) as DirectoryPage;
      setMore((previous) => [...previous, ...page.data]);
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
  const all = [...people, ...more].filter(
    (p) => !seen.has(p.id) && seen.add(p.id)
  );

  if (all.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
        <span className="bg-muted text-muted-foreground flex size-12 items-center justify-center rounded-full">
          <SearchX aria-hidden className="size-5" />
        </span>
        <p className="text-muted-foreground max-w-xs text-sm">
          No members match these filters.
        </p>
        {clearHref ? (
          <Link
            href={clearHref}
            className={buttonVariants({
              variant: "outline",
              size: "sm",
              className: "rounded-full",
            })}
          >
            Clear filters
          </Link>
        ) : null}
      </div>
    );
  }

  return (
    <div>
      <ul className="divide-border divide-y">
        {all.map((person) => (
          <Person
            key={person.id}
            person={person}
            isYou={person.id === viewerId}
          />
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
