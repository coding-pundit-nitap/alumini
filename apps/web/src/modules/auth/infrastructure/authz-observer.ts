import { getMetrics, logger } from "@/infrastructure/observability";

import type { AuthzObserver } from "../application/authorize";

/**
 * Every decision is counted (labels stay low-cardinality: permission names and outcomes, never user
 * ids); every denial is logged. There is no audit row yet: the audit table arrives with 2D, which is
 * when the admin-tier `authz.denied` audit (RBAC §9) is wired in.
 */
export const authzObserver: AuthzObserver = {
  record(event) {
    getMetrics().increment("authz_decisions_total", {
      permission: event.permission,
      outcome: event.outcome,
    });
    if (event.outcome === "denied") {
      logger.warn("authz.denied", {
        metadata: {
          permission: event.permission,
          reason: event.reason,
          actorId: event.userId,
          requestId: event.requestId,
        },
      });
    }
  },
};
