import type { DirectoryQuery } from "./query.ts";

/**
 * Everyone gets the same visibility rule; there is no privileged search. Admins open private profiles
 * by id, which is audited. Adapters resolve connections and blocks from `userId`.
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

/** Any adapter must apply visibility from Postgres. Throws `InvalidCursorError` for a bad cursor. */
export interface SearchPort {
  searchPeople(
    query: DirectoryQuery,
    viewer: SearchViewer
  ): Promise<PeoplePage>;
}
