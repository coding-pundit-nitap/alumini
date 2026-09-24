import { audit } from "@/infrastructure/audit";
import { prisma, transactionRunner } from "@/infrastructure/database/client";
import { getMetrics, logger } from "@/infrastructure/observability";
import { outbox } from "@/infrastructure/outbox";
import {
  ROLE_PERMISSIONS,
  SUPER_ADMIN_ROLE,
} from "@/infrastructure/role-permissions";
import {
  createAssignRole,
  createChangeAccountState,
  createGetDashboard,
  createGetUser,
  createGrantPermission,
  createListAuditLog,
  createListUsers,
  createRevokeGrant,
  createRevokeRole,
} from "@/modules/admin";
import {
  createPrismaAccessStore,
  createPrismaAdminStore,
} from "@/modules/admin/server";
import { authorize, can, loadGrants } from "@/modules/auth";

/** Wires the admin module to PostgreSQL. A failed tile is logged and counted, never thrown (spec A12-6). */
const store = createPrismaAdminStore(prisma);

export const getDashboard = createGetDashboard({
  store,
  can,
  onTileFailed: (tile, error) => {
    logger.warn("admin.dashboard.count_failed", { error, metadata: { tile } });
    getMetrics().increment("admin_dashboard_count_failed_total", { tile });
  },
});
export const listAuditLog = createListAuditLog({ store, authorize });

// The role catalogue and the super-admin role name are data injected here (RBAC §11: use cases name
// permissions); role-matrix.integration.test.ts proves ROLE_PERMISSIONS matches the database.
const accessStore = createPrismaAccessStore({
  runner: transactionRunner,
  audit,
  outbox,
  superAdminRole: SUPER_ADMIN_ROLE,
});
const access = { store: accessStore, authorize, loadGrants };
const roleDeps = {
  ...access,
  roles: ROLE_PERMISSIONS,
  superAdminRole: SUPER_ADMIN_ROLE,
};

export const listUsers = createListUsers({ store, authorize });
export const getUser = createGetUser({
  store,
  authorize,
  loadGrants,
  roles: ROLE_PERMISSIONS,
  superAdminRole: SUPER_ADMIN_ROLE,
});
export const changeAccountState = createChangeAccountState({
  ...access,
  superAdminRole: SUPER_ADMIN_ROLE,
});
export const assignRole = createAssignRole(roleDeps);
export const revokeRole = createRevokeRole(roleDeps);
export const grantPermission = createGrantPermission(access);
export const revokeGrant = createRevokeGrant(access);
