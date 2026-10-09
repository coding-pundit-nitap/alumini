/**
 * Client-safe exports only. Server-only ones are in `./server.ts`: Turbopack
 * bundles anything reachable from here, and the Prisma client crashes in the
 * browser.
 */
export { createClaimReport } from "./application/claim-report";
export { createDismissReport } from "./application/dismiss-report";
export { createFileContentReport } from "./application/file-content-report";
export { createGetReport } from "./application/get-report";
export { createListReports } from "./application/list-reports";
export { createResolveReport } from "./application/resolve-report";
export type { Authorize } from "./application/authz";
export type {
  ModerationAuditEntry,
  ModerationStore,
  ModerationTx,
  ReportRow,
  ReportView,
} from "./application/moderation-store";
export type {
  DismissReason,
  ModerationTarget,
  ReportTargetType,
  ResolveReason,
} from "./domain/moderation";
export {
  DISMISS_REASONS,
  REPORT_TARGET_TYPES,
  RESOLVE_REASONS,
} from "./domain/moderation";
export { ReportDialog } from "./presentation/ui/report-dialog";
export { ReportDecisionDialog } from "./presentation/ui/report-decision-dialog";
export {
  ReportFilters,
  REPORT_FILTER_LABELS,
} from "./presentation/ui/report-filters";
export { ReportsTable } from "./presentation/ui/reports-table";
export {
  REASON_LABELS,
  STATUS_LABELS,
  TARGET_LABELS,
} from "./presentation/ui/labels";
