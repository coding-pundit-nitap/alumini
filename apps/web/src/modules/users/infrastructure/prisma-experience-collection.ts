import type { ItemCollection } from "../application/item-collection";
import type { ExperienceInput, ExperienceItem } from "../domain/profile-items";
import type { CollectionDeps } from "./collection-support";
import { isoDate, lockProfileRow } from "./collection-support";

const CAP = 30;

function toRow(input: ExperienceInput) {
  return {
    company: input.company,
    industry: input.industry,
    designation: input.designation,
    startDate: new Date(`${input.startDate}T00:00:00.000Z`),
    endDate: input.endDate ? new Date(`${input.endDate}T00:00:00.000Z`) : null,
    isCurrent: input.isCurrent,
  };
}

function toItem(row: {
  id: string;
  company: string;
  industry: string | null;
  designation: string;
  startDate: Date;
  endDate: Date | null;
  isCurrent: boolean;
}): ExperienceItem {
  return {
    id: row.id,
    company: row.company,
    industry: row.industry,
    designation: row.designation,
    startDate: isoDate(row.startDate),
    endDate: row.endDate ? isoDate(row.endDate) : null,
    isCurrent: row.isCurrent,
  };
}

const ORDER = [
  { isCurrent: "desc" as const },
  { startDate: "desc" as const },
  { id: "asc" as const },
];

export function createPrismaExperienceCollection(
  deps: CollectionDeps
): ItemCollection<ExperienceInput, ExperienceItem> {
  return {
    async list(userId) {
      const rows = await deps.prisma.profileExperience.findMany({
        where: { userId },
        orderBy: ORDER,
      });
      return rows.map(toItem);
    },

    add: (userId, input) =>
      deps.runner.run(async (tx) => {
        await lockProfileRow(tx, userId);
        const count = await tx.profileExperience.count({ where: { userId } });
        if (count >= CAP) return { ok: false, reason: "LIMIT_REACHED" };
        const row = await tx.profileExperience.create({
          data: { userId, ...toRow(input) },
        });
        return { ok: true, item: toItem(row) };
      }),

    update: (userId, itemId, input) =>
      deps.runner.run(async (tx) => {
        const existing = await tx.profileExperience.findUnique({
          where: { id: itemId },
        });
        if (!existing || existing.userId !== userId) {
          return { ok: false, reason: "NOT_FOUND" };
        }
        const row = await tx.profileExperience.update({
          where: { id: itemId },
          data: toRow(input),
        });
        return { ok: true, item: toItem(row) };
      }),

    remove: (userId, itemId) =>
      deps.runner.run(async (tx) => {
        const existing = await tx.profileExperience.findUnique({
          where: { id: itemId },
        });
        if (!existing || existing.userId !== userId) return false;
        await tx.profileExperience.delete({ where: { id: itemId } });
        return true;
      }),
  };
}
