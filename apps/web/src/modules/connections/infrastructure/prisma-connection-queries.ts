import type { Prisma, PrismaClient } from "@nitap/database";

import type {
  ConnectionQueries,
  ListedConnection,
} from "../application/connection-store";
import { canonicalPair, relationOf, type Relation } from "../domain/connection";

const otherUser = {
  select: {
    id: true,
    name: true,
    profile: { select: { fullName: true, photoUploadId: true } },
  },
} as const;

/**
 * Reads for the connection lists and the profile button. Writes live in
 * `prisma-connection-store.ts`.
 */
export function createPrismaConnectionQueries(
  prisma: PrismaClient
): ConnectionQueries & {
  /**
   * The users module's `ConnectionLookup`: blocked in either direction,
   * connected, or neither.
   */
  relation(viewerId: string, ownerId: string): Promise<Relation>;
} {
  async function between(viewerId: string, otherId: string) {
    if (viewerId.toLowerCase() === otherId.toLowerCase()) return null;
    const { userAId, userBId } = canonicalPair(viewerId, otherId);
    return prisma.connection.findUnique({
      where: { userAId_userBId: { userAId, userBId } },
    });
  }

  return {
    between,

    async relation(viewerId, ownerId) {
      return relationOf(await between(viewerId, ownerId));
    },

    async list(userId, filter) {
      // The other side must still be a verified member, except in the blocked list (you can always unblock).
      const sides: Prisma.ConnectionWhereInput[] =
        filter.state === "BLOCKED"
          ? [{ userAId: userId }, { userBId: userId }]
          : [
              { userAId: userId, userB: { accountState: "VERIFIED" } },
              { userBId: userId, userA: { accountState: "VERIFIED" } },
            ];
      const and: Prisma.ConnectionWhereInput[] = [{ OR: sides }];
      if (filter.after) {
        and.push({
          OR: [
            { requestedAt: { lt: filter.after.requestedAt } },
            {
              requestedAt: filter.after.requestedAt,
              id: { gt: filter.after.id },
            },
          ],
        });
      }
      if (filter.direction === "OUTGOING") and.push({ requestedById: userId });
      if (filter.direction === "INCOMING") {
        and.push({ requestedById: { not: userId } });
      }
      if (filter.state === "BLOCKED") and.push({ blockedById: userId });

      const rows = await prisma.connection.findMany({
        where: { state: filter.state, AND: and },
        orderBy: [{ requestedAt: "desc" }, { id: "asc" }],
        take: filter.limit,
        include: { userA: otherUser, userB: otherUser },
      });

      return rows.map((row): ListedConnection => {
        const other = row.userAId === userId ? row.userB : row.userA;
        return {
          id: row.id,
          state: row.state,
          direction: row.requestedById === userId ? "OUTGOING" : "INCOMING",
          user: {
            id: other.id,
            fullName: other.profile?.fullName ?? other.name,
            hasPhoto: other.profile?.photoUploadId != null,
          },
          requestedAt: row.requestedAt,
          respondedAt: row.respondedAt,
        };
      });
    },
  };
}
