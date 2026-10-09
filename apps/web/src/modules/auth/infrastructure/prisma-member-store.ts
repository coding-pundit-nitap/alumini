import type { Prisma } from "@nitap/database";

import type { TransactionRunner } from "@/infrastructure/database/transaction-runner";

import type { MemberStore, MemberTx } from "../application/member-store";

function createMemberTx(tx: Prisma.TransactionClient): MemberTx {
  return {
    findUser: (userId) =>
      tx.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          name: true,
          email: true,
          emailVerified: true,
          accountState: true,
        },
      }),

    // ON CONFLICT DO NOTHING: two concurrent provisioners cannot both insert, and neither fails.
    async ensureProfile(userId, fullName) {
      const result = await tx.profile.createMany({
        data: [{ userId, fullName }],
        skipDuplicates: true,
      });
      return result.count === 1;
    },

    // The WHERE makes the transition atomic: only one caller can move a row out of PENDING.
    async markVerified(userId) {
      const result = await tx.user.updateMany({
        where: { id: userId, accountState: "PENDING" },
        data: { accountState: "VERIFIED" },
      });
      return result.count === 1;
    },

    async assignRole(userId, roleName, grantedBy) {
      const role = await tx.role.findUniqueOrThrow({
        where: { name: roleName },
        select: { id: true },
      });
      await tx.userRole.createMany({
        data: [{ userId, roleId: role.id, grantedBy }],
        skipDuplicates: true,
      });
    },
  };
}

/**
 * Every method of one `transaction` callback runs in a single Prisma
 * interactive transaction.
 */
export function createPrismaMemberStore(
  runner: Pick<TransactionRunner, "run">
): MemberStore {
  return {
    transaction: (work) => runner.run((tx) => work(createMemberTx(tx))),
  };
}
