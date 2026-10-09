/**
 * Retention categories. Pure data shared by the seed, the admin domain (bounds)
 * and the worker (which category it enforces). The defaults are MVP placeholders until the institute signs off.
 */
export const RETENTION_CATEGORIES = [
  "notifications",
  "deactivated_accounts",
  "deleted_content",
  "reports",
  "audit_logs",
  "donation_records",
] as const;

export type RetentionCategory = (typeof RETENTION_CATEGORIES)[number];

export const RETENTION_CATALOGUE: Record<
  RetentionCategory,
  { defaultDays: number; minDays: number; maxDays: number; enforced: boolean }
> = {
  notifications: { defaultDays: 90, minDays: 7, maxDays: 3650, enforced: true },
  deactivated_accounts: {
    defaultDays: 90,
    minDays: 7,
    maxDays: 3650,
    enforced: false,
  },
  deleted_content: {
    defaultDays: 30,
    minDays: 7,
    maxDays: 3650,
    enforced: false,
  },
  reports: { defaultDays: 365, minDays: 7, maxDays: 3650, enforced: false },
  // Audit logs at least a year; donation records 7 years (finance office to confirm).
  audit_logs: {
    defaultDays: 365,
    minDays: 365,
    maxDays: 3650,
    enforced: false,
  },
  donation_records: {
    defaultDays: 2555,
    minDays: 2555,
    maxDays: 3650,
    enforced: false,
  },
};
