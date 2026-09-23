import type { Prisma, PrismaClient } from "@nitap/database";

import type { AdminStore, AuditFilter } from "../application/admin-store";
import type { TileKey } from "../domain/access";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Cross-module, read-only SQL (overview AD-2). Every queue count is on an indexed status column; the audit
 * keyset uses (created_at DESC, id DESC) and lands on ix_audit_actor / ix_audit_action / ix_audit_target.
 */
export function createPrismaAdminStore(db: PrismaClient): AdminStore {
  const counters: Record<Exclude<TileKey, "members">, () => Promise<number>> = {
    pendingVerifications: () =>
      db.verificationRequest.count({ where: { status: "PENDING" } }),
    openReports: () =>
      db.report.count({
        where: { status: { in: ["OPEN", "UNDER_REVIEW"] } },
      }),
    pendingJobs: () => db.job.count({ where: { status: "PENDING_REVIEW" } }),
    pendingAchievements: () =>
      db.achievement.count({ where: { status: "SUBMITTED" } }),
    failedEmails: () =>
      db.notificationDelivery.count({
        where: { channel: "EMAIL", status: "FAILED" },
      }),
  };

  const where = (f: AuditFilter): Prisma.AuditLogWhereInput => ({
    actorId: f.actorId,
    action: f.action,
    targetType: f.targetType,
    targetId: f.targetId,
    createdAt: f.from || f.to ? { gte: f.from, lt: f.to } : undefined,
  });

  return {
    async countTile(key, now) {
      if (key !== "members") return counters[key]();
      // ponytail: seq scan on user.created_at; add ix_user_created_at if the members tile gets slow.
      const [groups, newLast7Days] = await Promise.all([
        db.user.groupBy({ by: ["accountState"], _count: { _all: true } }),
        db.user.count({
          where: { createdAt: { gte: new Date(now.getTime() - WEEK_MS) } },
        }),
      ]);
      return {
        byState: Object.fromEntries(
          groups.map((g) => [g.accountState, g._count._all])
        ),
        newLast7Days,
      };
    },

    async listAuditLog({ filter, after, take }) {
      const rows = await db.auditLog.findMany({
        where: {
          AND: [
            where(filter),
            after
              ? {
                  OR: [
                    { createdAt: { lt: after.createdAt } },
                    { createdAt: after.createdAt, id: { lt: after.id } },
                  ],
                }
              : {},
          ],
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take,
        include: { actor: { select: { id: true, name: true, email: true } } },
      });
      return rows.map((r) => ({
        id: r.id,
        createdAt: r.createdAt,
        action: r.action,
        targetType: r.targetType,
        targetId: r.targetId,
        metadata: r.metadata as Record<string, unknown>,
        requestId: r.requestId,
        actor: r.actor,
      }));
    },
  };
}
