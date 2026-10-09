import type { DirectoryQuery } from "./query.ts";

/**
 * Who is searching. Everyone gets the same rule: PUBLIC and MEMBERS_ONLY profiles, plus CONNECTIONS_ONLY ones
 * for their connections, and never a blocked pair. There is deliberately no privileged reach: an admin who
 * needs a private profile opens it by id, which is audited; a listing would not be.
 * The viewer's connections and blocks are NOT passed in (a member can have thousands): an adapter resolves
 * them from `userId`.
 */
export type SearchViewer = { userId: string };

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
 * The seam asks for. The Postgres adapter (Stage A) implements it today; an
 * OpenSearch adapter may replace it, but must still apply visibility from Postgres before returning.
 * Throws `InvalidCursorError` for a bad `query.cursor`.
 */
export interface SearchPort {
  searchPeople(
    query: DirectoryQuery,
    viewer: SearchViewer
  ): Promise<PeoplePage>;
}
