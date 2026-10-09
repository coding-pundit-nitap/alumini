import type { Grant } from "../domain/actor";

export interface GrantSource {
  /** Role-derived ∪ direct grants, excluding those expired at `now`. */
  loadGrants(userId: string, now: Date): Promise<readonly Grant[]>;
}
