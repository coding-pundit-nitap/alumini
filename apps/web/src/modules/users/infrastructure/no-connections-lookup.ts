import type { ConnectionLookup } from "../application/connection-lookup";

/**
 * Phase 3 has no connections (Phase 5). Until then CONNECTIONS_ONLY behaves like PRIVATE for everyone but
 * the owner and privileged viewers. Phase 5 replaces this adapter; the visibility rule does not change.
 */
export const noConnectionsLookup: ConnectionLookup = {
  async relation() {
    return "none";
  },
};
