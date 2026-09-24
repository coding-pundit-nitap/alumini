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
export { isUuid, userListQuerySchema } from "./domain/user-query";
export { AccessList } from "./presentation/ui/access-list";
export { AccountStateDialog } from "./presentation/ui/account-state-dialog";
export { ConfirmButton } from "./presentation/ui/confirm-button";
export { AssignRoleDialog } from "./presentation/ui/assign-role-dialog";
export { GrantPermissionDialog } from "./presentation/ui/grant-permission-dialog";
export { UserFilters } from "./presentation/ui/user-filters";
export { UsersTable } from "./presentation/ui/users-table";
export {
  LAST_SUPER_ADMIN_NOTE,
  STATE_LABEL,
  USER_FILTER_LABELS,
} from "./presentation/ui/labels";
export { canTransition } from "./domain/lifecycle";
export type { AccountStateValue } from "./domain/lifecycle";
