import { prisma } from "@/infrastructure/database/client";
import { getMetrics, logger } from "@/infrastructure/observability";
import { createGetDashboard, createListAuditLog } from "@/modules/admin";
import { createPrismaAdminStore } from "@/modules/admin/server";
import { authorize, can } from "@/modules/auth";

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
