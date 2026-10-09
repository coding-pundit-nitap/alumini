export type Relation = "none" | "connected" | "blocked";

/**
 * Answered by the connections module
 * (`createPrismaConnectionQueries().relation`), wired in
 * `composition/users.ts`.
 */
export interface ConnectionLookup {
  relation(viewerId: string, ownerId: string): Promise<Relation>;
}
