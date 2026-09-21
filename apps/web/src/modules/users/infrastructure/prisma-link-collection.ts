import type { ItemCollection } from "../application/item-collection";
import type { LinkInput, LinkItem } from "../domain/profile-items";
import type { CollectionDeps } from "./collection-support";
import { isDuplicate, lockProfileRow } from "./collection-support";

const CAP = 10;

function toItem(row: {
  id: string;
  type: LinkItem["type"];
  url: string;
}): LinkItem {
  return { id: row.id, type: row.type, url: row.url };
}

export function createPrismaLinkCollection(
  deps: CollectionDeps
): ItemCollection<LinkInput, LinkItem> {
  return {
    async list(userId) {
      const rows = await deps.prisma.profileLink.findMany({
        where: { userId },
        orderBy: [{ type: "asc" }, { createdAt: "asc" }, { id: "asc" }],
      });
      return rows.map(toItem);
    },

    add: (userId, input) =>
      deps.runner.run(async (tx) => {
        await lockProfileRow(tx, userId);
        const count = await tx.profileLink.count({ where: { userId } });
        if (count >= CAP) return { ok: false, reason: "LIMIT_REACHED" };
        try {
          const row = await tx.profileLink.create({
            data: { userId, type: input.type, url: input.url },
          });
          return { ok: true, item: toItem(row) };
        } catch (error) {
          if (isDuplicate(error)) return { ok: false, reason: "DUPLICATE" };
          throw error;
        }
      }),

    update: (userId, itemId, input) =>
      deps.runner.run(async (tx) => {
        const existing = await tx.profileLink.findUnique({
          where: { id: itemId },
        });
        if (!existing || existing.userId !== userId) {
          return { ok: false, reason: "NOT_FOUND" };
        }
        try {
          const row = await tx.profileLink.update({
            where: { id: itemId },
            data: { type: input.type, url: input.url },
          });
          return { ok: true, item: toItem(row) };
        } catch (error) {
          if (isDuplicate(error)) return { ok: false, reason: "DUPLICATE" };
          throw error;
        }
      }),

    remove: (userId, itemId) =>
      deps.runner.run(async (tx) => {
        const existing = await tx.profileLink.findUnique({
          where: { id: itemId },
        });
        if (!existing || existing.userId !== userId) return false;
        await tx.profileLink.delete({ where: { id: itemId } });
        return true;
      }),
  };
}
