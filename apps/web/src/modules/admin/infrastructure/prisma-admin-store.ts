import type { Prisma, PrismaClient } from "@nitap/database";

import type { AdminStore, AuditFilter } from "../application/admin-store";
import type { TileKey } from "../domain/access";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

// Prisma's startsWith/contains pass the pattern straight into LIKE without escaping `%`/`_`, so a
// literal search term must be backslash-escaped first (Postgres' default LIKE escape character).
const escapeLike = (text: string) => text.replace(/[\\%_]/g, "\\$&");

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

    // ponytail: ILIKE prefix seq-scan on user; add a lower(name) text_pattern_ops index if the list
    // exceeds ~10^5 rows.
    async listUsers({ filter, after, take }) {
      const rows = await db.user.findMany({
        where: {
          AND: [
            filter.q
              ? {
                  OR: [
                    {
                      email: {
                        startsWith: escapeLike(filter.q),
                        mode: "insensitive",
                      },
                    },
                    {
                      name: {
                        startsWith: escapeLike(filter.q),
                        mode: "insensitive",
                      },
                    },
                  ],
                }
              : {},
            filter.state ? { accountState: filter.state as never } : {},
            filter.role
              ? { userRoles: { some: { role: { name: filter.role } } } }
              : {},
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
        select: {
          id: true,
          name: true,
          email: true,
          accountState: true,
          createdAt: true,
          userRoles: { select: { role: { select: { name: true } } } },
        },
      });
      return rows.map(({ userRoles, ...u }) => ({
        ...u,
        roles: userRoles.map((r) => r.role.name),
      }));
    },

    async getUser(id, superAdminRole) {
      const u = await db.user.findUnique({
        where: { id },
        select: {
          id: true,
          name: true,
          email: true,
          accountState: true,
          deactivatedAt: true,
          createdAt: true,
          userRoles: {
            select: {
              grantedAt: true,
              role: { select: { name: true } },
              grantedByUser: { select: { id: true, name: true } },
            },
          },
          permissionGrants: {
            orderBy: { grantedAt: "desc" },
            select: {
              id: true,
              permission: true,
              scopeType: true,
              chapterId: true,
              grantedAt: true,
              expiresAt: true,
              chapter: { select: { slug: true } },
              grantedByUser: { select: { id: true, name: true } },
            },
          },
        },
      });
      if (!u) return null;
      const activeSupers = await db.userRole.findMany({
        where: {
          role: { name: superAdminRole },
          user: { accountState: "VERIFIED" },
        },
        select: { userId: true },
      });
      return {
        id: u.id,
        name: u.name,
        email: u.email,
        accountState: u.accountState,
        deactivatedAt: u.deactivatedAt,
        createdAt: u.createdAt,
        roles: u.userRoles.map((r) => ({
          name: r.role.name,
          grantedAt: r.grantedAt,
          grantedBy: r.grantedByUser,
        })),
        grants: u.permissionGrants.map((g) => ({
          id: g.id,
          permission: g.permission,
          scope: g.scopeType,
          chapterId: g.chapterId,
          chapterSlug: g.chapter?.slug ?? null,
          grantedAt: g.grantedAt,
          expiresAt: g.expiresAt,
          grantedBy: g.grantedByUser,
        })),
        isLastSuperAdmin:
          activeSupers.length === 1 && activeSupers[0]?.userId === u.id,
      };
    },

    listChapters: () =>
      db.chapter.findMany({
        where: { archivedAt: null },
        orderBy: { slug: "asc" },
        select: { id: true, slug: true },
      }),
  };
}
