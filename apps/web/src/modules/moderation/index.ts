/**
 * Public API of the moderation module. Other code imports from here, never from the module's internals.
 *
 * Client-safe only: no export here may reach `@nitap/database`'s generated Prisma client at runtime
 * (only type-only imports of it, which erase, are fine). `presentation/ui/report-dialog.tsx` is a
 * client component, and Turbopack pulls whatever a barrel's importer reaches through — including an
 * unused re-export with runtime side effects — into the client bundle, which the Node-only Prisma
 * client cannot survive (crashes every route that imports anything from here, e.g. `/feed`).
 * Server-only exports (currently just `createPrismaModerationStore`) live in `./server.ts` instead.
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
