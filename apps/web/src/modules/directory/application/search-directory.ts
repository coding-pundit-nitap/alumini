import { PERMISSIONS } from "@nitap/database/permissions";
import type { DirectoryQuery, PersonHit, SearchPort } from "@nitap/search";

import { RateLimitedError } from "@/lib/errors";
import type { Actor, Permission } from "@/modules/auth";

type Authorize = (actor: Actor | null, permission: Permission) => Actor;

/** `directory.search`: 60 a minute per member (API spec §2). Also the scraping brake (TDS §26). */
export const SEARCH_RATE = { max: 60, window: 60 } as const;

export type RateLimiter = {
  consume(
    key: string,
    rule: { max: number; window: number }
  ): Promise<{ allowed: boolean; retryAfter: number | null }>;
};

export type AlumniSummary = Omit<PersonHit, "hasPhoto" | "userId"> & {
  id: string;
  photoUrl?: string;
};

export type DirectoryPage = {
  data: AlumniSummary[];
  page: { limit: number; nextCursor: string | null; hasMore: boolean };
};

/**
 * Directory search for a verified member. Which profiles and fields the searcher may see is the
 * search adapter's job, in the query; there is no privileged reach (see `SearchViewer`). There are no totals or counts anywhere,
 * so a private profile leaks through neither (SRS §27).
 */
export function createSearchDirectory(deps: {
  authorize: Authorize;
  search: SearchPort;
  rateLimiter: RateLimiter;
}) {
  return async function searchDirectory(args: {
    actor: Actor | null;
    query: DirectoryQuery;
  }): Promise<DirectoryPage> {
    const actor = deps.authorize(args.actor, PERMISSIONS.DIRECTORY_SEARCH);

    const verdict = await deps.rateLimiter.consume(
      `directory.search:${actor.userId}`,
      SEARCH_RATE
    );
    if (!verdict.allowed) throw new RateLimitedError(verdict.retryAfter ?? 60);

    const { hits, nextCursor } = await deps.search.searchPeople(args.query, {
      userId: actor.userId,
    });

    return {
      data: hits.map(({ userId, hasPhoto, ...rest }) => ({
        id: userId,
        ...rest,
        ...(hasPhoto ? { photoUrl: `/api/photos/${userId}` } : {}),
      })),
      page: {
        limit: args.query.limit,
        nextCursor,
        hasMore: nextCursor !== null,
      },
    };
  };
}

export type SearchDirectory = ReturnType<typeof createSearchDirectory>;
