import type { DirectoryQuery } from "./query.ts";

/**
 * Who is searching. `reach` is decided by the caller's authorization, not by the search engine:
 * `members` sees profiles at MEMBERS_ONLY or looser; `everything` (a privileged reader) sees all.
 * The viewer's connections and blocks are NOT passed in (a member can have thousands): an adapter resolves them
 * from `userId`, so CONNECTIONS_ONLY profiles appear for connections and a blocked pair never sees each other.
 */
export type SearchViewer = { userId: string; reach: "members" | "everything" };

/** One directory row. Every optional-looking field is already null when the viewer may not see it. */
export type PersonHit = {
  userId: string;
  fullName: string;
  headline: string | null;
  department: string | null;
  degree: string | null;
  graduationYear: number | null;
  location: string | null;
  currentCompany: string | null;
  currentDesignation: string | null;
  hasPhoto: boolean;
};

export type PeoplePage = { hits: PersonHit[]; nextCursor: string | null };

/**
 * The seam FR-SEARCH-003 asks for. The Postgres adapter (Stage A, TDS §14) implements it today; an
 * OpenSearch adapter may replace it, but must still apply visibility from Postgres before returning.
 * Throws `InvalidCursorError` for a bad `query.cursor`.
 */
export interface SearchPort {
  searchPeople(
    query: DirectoryQuery,
    viewer: SearchViewer
  ): Promise<PeoplePage>;
}
