import type { ItemCollection } from "../application/item-collection";
import type { EducationInput, EducationItem } from "../domain/profile-items";
import type { CollectionDeps } from "./collection-support";
import { lockProfileRow } from "./collection-support";

const CAP = 20;

function toRow(input: EducationInput) {
  return {
    institution: input.institution,
    qualification: input.qualification,
    fieldOfStudy: input.fieldOfStudy,
    startYear: input.startYear,
    endYear: input.endYear,
  };
}

function toItem(row: {
  id: string;
  institution: string;
  qualification: string;
  fieldOfStudy: string | null;
  startYear: number;
  endYear: number | null;
}): EducationItem {
  return {
    id: row.id,
    institution: row.institution,
    qualification: row.qualification,
    fieldOfStudy: row.fieldOfStudy,
    startYear: row.startYear,
    endYear: row.endYear,
  };
}

const ORDER = [
  { endYear: { sort: "desc" as const, nulls: "first" as const } },
  { startYear: "desc" as const },
  { id: "asc" as const },
];

export function createPrismaEducationCollection(
  deps: CollectionDeps
): ItemCollection<EducationInput, EducationItem> {
  return {
    async list(userId) {
      const rows = await deps.prisma.profileEducation.findMany({
        where: { userId },
        orderBy: ORDER,
      });
      return rows.map(toItem);
    },

    add: (userId, input) =>
      deps.runner.run(async (tx) => {
        await lockProfileRow(tx, userId);
        const count = await tx.profileEducation.count({ where: { userId } });
        if (count >= CAP) return { ok: false, reason: "LIMIT_REACHED" };
        const row = await tx.profileEducation.create({
          data: { userId, ...toRow(input) },
        });
        return { ok: true, item: toItem(row) };
      }),

    update: (userId, itemId, input) =>
      deps.runner.run(async (tx) => {
        const existing = await tx.profileEducation.findUnique({
          where: { id: itemId },
        });
        if (!existing || existing.userId !== userId) {
          return { ok: false, reason: "NOT_FOUND" };
        }
        const row = await tx.profileEducation.update({
          where: { id: itemId },
          data: toRow(input),
        });
        return { ok: true, item: toItem(row) };
      }),

    remove: (userId, itemId) =>
      deps.runner.run(async (tx) => {
        const existing = await tx.profileEducation.findUnique({
          where: { id: itemId },
        });
        if (!existing || existing.userId !== userId) return false;
        await tx.profileEducation.delete({ where: { id: itemId } });
        return true;
      }),
  };
}
