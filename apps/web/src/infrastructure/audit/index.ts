import { createAuditWriter } from "@nitap/database/audit";

import { getRequestContext } from "@/infrastructure/observability";

/**
 * The audit writer for use cases (TDS §3.3): call `audit.record(tx, entry)` inside a
 * `transactionRunner.run` callback so the audit row commits or rolls back with the change it records.
 */
export const audit = createAuditWriter({
  requestId: () => getRequestContext()?.requestId,
});

export type { AuditEntry } from "@nitap/database/audit";
