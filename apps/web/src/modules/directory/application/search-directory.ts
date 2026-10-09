import type { Tick } from "@/lib/role-tick";
import { PERMISSIONS } from "@nitap/database/permissions";
import type { DirectoryQuery, PersonHit, SearchPort } from "@nitap/search";

import { RateLimitedError } from "@/lib/errors";
import type { Actor, Permission } from "@/modules/auth";

type Authorize = (actor: Actor | null, permission: Permission) => Actor;

/** `directory.search`: 60 a minute per member. Also the scraping brake. */
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
  /** Set by composition after the search; absent/null = no tick. */
  tick?: Tick | null;
};

export type DirectoryPage = {
  data: AlumniSummary[];
  page: { limit: number; nextCursor: string | null; hasMore: boolean };
};

/**
 * Visibility is enforced in the search adapter's query. No totals or counts are returned, so private
 * profiles cannot leak through them.
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
