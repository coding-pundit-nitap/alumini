import type { Grant } from "../domain/actor";

/**
 * Where an actor's effective grants come from. The Prisma adapter is in infrastructure; a cache
 * (RBAC open item 5) would wrap this port without touching the rules.
 */
export interface GrantSource {
  /** Role-derived ∪ direct grants, excluding those expired at `now`. */
  loadGrants(userId: string, now: Date): Promise<readonly Grant[]>;
}
