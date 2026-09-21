import type { AuditWriter } from "@nitap/database/audit";

import type { TransactionRunner } from "@/infrastructure/database/transaction-runner";

import type { ProfileAudit } from "../application/profile-audit";

export function createProfileAudit(deps: {
  runner: Pick<TransactionRunner, "run">;
  audit: AuditWriter;
}): ProfileAudit {
  return {
    recordPrivilegedRead: ({ actorId, targetUserId }) =>
      deps.runner.run((tx) =>
        deps.audit.record(tx, {
          actorId,
          action: "profile.read_any",
          targetType: "profile",
          targetId: targetUserId,
          // A free-text reason arrives with the Phase 12 admin UI (spec 3A O-4).
          metadata: { reason: "direct view" },
        })
      ),
  };
}
