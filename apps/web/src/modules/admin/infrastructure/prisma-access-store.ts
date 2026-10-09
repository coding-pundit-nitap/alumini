import { Prisma } from "@nitap/database";
import type { AuditWriter } from "@nitap/database/audit";
import type { OutboxWriter } from "@nitap/database/outbox";

import type { TransactionRunner } from "@/infrastructure/database/transaction-runner";
import { ConflictError } from "@/lib/errors";

import type {
  AccessStore,
  AccessTx,
  GrantRow,
} from "../application/access-store";

const isUniqueViolation = (error: unknown) => {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (error.code === "P2002") return true;
  // uq_permission_grant is hand-written SQL, so its violation can surface as P2010 instead of P2002.
  if (error.code === "P2010") {
    return (error.meta as { code?: string } | undefined)?.code === "23505";
  }
  return false;
};

const toGrant = (g: {
  id: string;
  userId: string;
  permission: string;
  scopeType: "GLOBAL" | "CHAPTER";
  chapterId: string | null;
  expiresAt: Date | null;
}): GrantRow => ({
  id: g.id,
  userId: g.userId,
  permission: g.permission as GrantRow["permission"],
  scope: g.scopeType,
  chapterId: g.chapterId,
  expiresAt: g.expiresAt,
});

/**
 * Each write carries its audit row and notice event in the same transaction.
 * Locks are taken target user first, then super-admin rows in id order, so
 * admin writes cannot deadlock. `FOR NO KEY UPDATE` avoids blocking unrelated
 * inserts that reference the user.
 */
export function createPrismaAccessStore(deps: {
  runner: Pick<TransactionRunner, "run">;
  audit: AuditWriter;
  outbox: OutboxWriter;
  superAdminRole: string;
}): AccessStore {
  const { superAdminRole } = deps;

  const forClient = (db: Prisma.TransactionClient): AccessTx => ({
    async findUserForUpdate(id) {
      const rows = await db.$queryRaw<{ account_state: string }[]>`
        SELECT account_state FROM "user" WHERE id = ${id}::uuid FOR NO KEY UPDATE`;
      const row = rows[0];
      if (!row) return null;
      const roles = await db.userRole.findMany({
        where: { userId: id },
        select: { role: { select: { name: true } } },
      });
      return {
        id,
        accountState: row.account_state as never,
        roles: roles.map((r) => r.role.name),
      };
    },

    async setAccountState(id, from, to, deactivatedAt) {
      const { count } = await db.user.updateMany({
        where: { id, accountState: from },
        data: { accountState: to, deactivatedAt },
      });
      return count === 1;
    },

    async deleteSessions(userId) {
      return (await db.session.deleteMany({ where: { userId } })).count;
    },

    async lockSuperAdmins() {
      await db.$queryRaw`
        SELECT ur.id FROM user_role ur JOIN role r ON r.id = ur.role_id
        WHERE r.name = ${superAdminRole} ORDER BY ur.id FOR UPDATE OF ur`;
      // A separate statement: under READ COMMITTED it sees what a concurrent holder of the lock committed.
      const rows = await db.userRole.findMany({
        where: {
          role: { name: superAdminRole },
          user: { accountState: "VERIFIED" },
        },
        select: { userId: true },
      });
      return rows.map((r) => r.userId);
    },

    async insertUserRole(userId, role, grantedBy) {
      const { id: roleId } = await db.role.findUniqueOrThrow({
        where: { name: role },
      });
      try {
        await db.userRole.create({ data: { userId, roleId, grantedBy } });
      } catch (error) {
        if (isUniqueViolation(error))
          throw new ConflictError("ROLE_ALREADY_HELD");
        throw error;
      }
    },

    async deleteUserRole(userId, role) {
      const { count } = await db.userRole.deleteMany({
        where: { userId, role: { name: role } },
      });
      return count === 1;
    },

    async findChapter(id) {
      const c = await db.chapter.findUnique({
        where: { id },
        select: { id: true, archivedAt: true },
      });
      return c ? { id: c.id, archived: c.archivedAt !== null } : null;
    },

    async insertGrant({ scope, ...input }) {
      try {
        return toGrant(
          await db.permissionGrant.create({
            data: { ...input, scopeType: scope },
          })
        );
      } catch (error) {
        if (isUniqueViolation(error)) throw new ConflictError("GRANT_EXISTS");
        throw error;
      }
    },

    async findGrant(userId, grantId) {
      const g = await db.permissionGrant.findFirst({
        where: { id: grantId, userId },
      });
      return g ? toGrant(g) : null;
    },

    async deleteGrant(grantId) {
      await db.permissionGrant.delete({ where: { id: grantId } });
    },

    async audit(entry) {
      await deps.audit.record(db, {
        actorId: entry.actorId,
        action: entry.action,
        targetType: "user",
        targetId: entry.targetUserId,
        metadata: entry.metadata,
      });
    },

    async enqueue(event) {
      await deps.outbox.add(db, event);
    },
  });

  return {
    transaction: (work) => deps.runner.run((db) => work(forClient(db))),
  };
}
