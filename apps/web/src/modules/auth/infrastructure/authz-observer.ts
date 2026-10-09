import { audit } from "@/infrastructure/audit";
import { getMetrics, logger } from "@/infrastructure/observability";

import type { AuthzObserver } from "../application/authorize";
import { createDeniedAudit } from "./denied-audit";

// The client is imported lazily so a module that merely wires up authorize() (e.g. under unit test,
// where DATABASE_URL is unset) never loads it; it is only needed once an admin-tier denial actually occurs.
const recordDenied = createDeniedAudit({
  write: async (entry) => {
    const { prisma } = await import("@/infrastructure/database/client");
    await audit.record(prisma, entry);
  },
  onDropped: () => getMetrics().increment("authz_denied_audit_dropped_total"),
  onFailed: (error) => {
    logger.warn("authz.denied.audit_failed", { error });
    getMetrics().increment("authz_denied_audit_failed_total");
  },
});

/** Every decision is counted, every denial logged, and admin-tier denials leave a best-effort audit row. */
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
      recordDenied(event);
    }
  },
};
