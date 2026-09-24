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
export {
  AUDIT_FILTER_LABELS,
  AuditFilters,
} from "./presentation/ui/audit-filters";
export { AuditTable } from "./presentation/ui/audit-table";
export { DashboardTiles } from "./presentation/ui/dashboard-tiles";
export { createListUsers } from "./application/list-users";
export type { ListUsers } from "./application/list-users";
export { createGetUser } from "./application/get-user";
export type { GetUser, UserView } from "./application/get-user";
export { createChangeAccountState } from "./application/change-account-state";
export { createAssignRole } from "./application/assign-role";
export { createRevokeRole } from "./application/revoke-role";
export { createGrantPermission } from "./application/grant-permission";
export { createRevokeGrant } from "./application/revoke-grant";
export type { GrantRow } from "./application/access-store";
export type { UserDetail, UserRow } from "./application/admin-store";
export type { AccessOptions } from "./domain/escalation";
export { ESCALATION_MESSAGES } from "./domain/escalation";
export { SUSPENSION_REASONS, TARGET_STATES } from "./domain/lifecycle";
export { userListQuerySchema } from "./domain/user-query";
