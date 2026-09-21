import type { ItemCollection } from "../application/item-collection";
import type { SkillInput, SkillItem } from "../domain/profile-items";
import type { CollectionDeps } from "./collection-support";
import { isDuplicate, lockProfileRow } from "./collection-support";

const CAP = 50;

function toItem(row: { id: string; skill: string }): SkillItem {
  return { id: row.id, skill: row.skill };
}

export function createPrismaSkillCollection(
  deps: CollectionDeps
): ItemCollection<SkillInput, SkillItem> {
  return {
    async list(userId) {
      const rows = await deps.prisma.profileSkill.findMany({
        where: { userId },
        orderBy: [{ skill: "asc" }, { id: "asc" }],
      });
      return rows.map(toItem);
    },

    add: (userId, input) =>
      deps.runner.run(async (tx) => {
        await lockProfileRow(tx, userId);
        const count = await tx.profileSkill.count({ where: { userId } });
        if (count >= CAP) return { ok: false, reason: "LIMIT_REACHED" };
        try {
          const row = await tx.profileSkill.create({
            data: { userId, skill: input.skill },
          });
          return { ok: true, item: toItem(row) };
        } catch (error) {
          if (isDuplicate(error)) return { ok: false, reason: "DUPLICATE" };
          throw error;
        }
      }),

    update: (userId, itemId, input) =>
      deps.runner.run(async (tx) => {
        const existing = await tx.profileSkill.findUnique({
          where: { id: itemId },
        });
        if (!existing || existing.userId !== userId) {
          return { ok: false, reason: "NOT_FOUND" };
        }
        try {
          const row = await tx.profileSkill.update({
            where: { id: itemId },
            data: { skill: input.skill },
          });
          return { ok: true, item: toItem(row) };
        } catch (error) {
          if (isDuplicate(error)) return { ok: false, reason: "DUPLICATE" };
          throw error;
        }
      }),

    remove: (userId, itemId) =>
      deps.runner.run(async (tx) => {
        const existing = await tx.profileSkill.findUnique({
          where: { id: itemId },
        });
        if (!existing || existing.userId !== userId) return false;
        await tx.profileSkill.delete({ where: { id: itemId } });
        return true;
      }),
  };
}
