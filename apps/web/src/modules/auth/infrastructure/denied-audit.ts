import type { AuditEntry } from "@nitap/database/audit";
import { ADMIN_TIER_PERMISSIONS } from "@nitap/database/permissions";

import type { AuthzEvent } from "../application/authorize";

type DeniedEvent = Extract<AuthzEvent, { outcome: "denied" }>;
const ADMIN_TIER: ReadonlySet<string> = new Set(ADMIN_TIER_PERMISSIONS);

/**
 * RBAC §9 `authz.denied`, admin-tier only (spec B12-13). `authorize()` is synchronous and there is no business
 * write to join, so this is the one non-transactional audit: fire-and-forget, at most `maxInFlight` writes
 * pending, drops and failures counted by the caller's callbacks. Never throws into the request.
 */
export function createDeniedAudit(deps: {
  write: (entry: AuditEntry) => Promise<void>;
  onDropped: () => void;
  onFailed: (error: unknown) => void;
  maxInFlight?: number;
}): (event: DeniedEvent) => void {
  const max = deps.maxInFlight ?? 32;
  let inFlight = 0;

  return (event) => {
    if (!ADMIN_TIER.has(event.permission)) return;
    if (inFlight >= max) {
      deps.onDropped();
      return;
    }
    inFlight += 1;
    deps
      .write({
        actorId: event.userId,
        action: "authz.denied",
        targetType: "user",
        targetId: event.subjectUserId ?? event.userId,
        metadata: {
          permission: event.permission,
          reason: event.reason,
          ...(event.chapterId ? { chapterId: event.chapterId } : {}),
        },
      })
      .catch(deps.onFailed)
      .finally(() => {
        inFlight -= 1;
      });
  };
}
