import { createAuditWriter } from "@nitap/database/audit";

import { getRequestContext } from "@/infrastructure/observability";

/**
 * Call inside a `transactionRunner.run` callback so the audit row commits with
 * the change.
 */
export const audit = createAuditWriter({
  requestId: () => getRequestContext()?.requestId,
});

export type { AuditEntry } from "@nitap/database/audit";
