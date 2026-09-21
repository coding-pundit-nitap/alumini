export type Relation = "none" | "connected" | "blocked";

/** Answered by the connections module from Phase 5; until then an adapter that always says "none". */
export interface ConnectionLookup {
  relation(viewerId: string, ownerId: string): Promise<Relation>;
}
