/**
 * Public API of the admin module (client-safe). Server-only exports (the Prisma store) live in
 * `./server.ts`, for the same reason as `modules/moderation` (see its index note).
 */
export {
  ADMIN_PERMISSIONS,
  adminNavigation,
  dashboardTiles,
  hasAdminAccess,
} from "./domain/access";
export type { Can, NavIcon, NavItem, TileKey } from "./domain/access";
export { createGetDashboard } from "./application/get-dashboard";
export type { DashboardTile, GetDashboard } from "./application/get-dashboard";
export { createListAuditLog } from "./application/list-audit-log";
export type { ListAuditLog } from "./application/list-audit-log";
export type {
  AdminStore,
  AuditFilter,
  AuditRow,
  MembersSummary,
  TileCount,
} from "./application/admin-store";
export { auditQuerySchema } from "./domain/audit-query";
export { AdminSidebar } from "./presentation/ui/admin-sidebar";
export { AuditFilters } from "./presentation/ui/audit-filters";
export { AuditTable } from "./presentation/ui/audit-table";
export { DashboardTiles } from "./presentation/ui/dashboard-tiles";
