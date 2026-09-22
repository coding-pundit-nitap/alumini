import { Prisma, type PrismaClient } from "@nitap/database";

import type { JobQueries } from "../application/job-queries";

/** Reads for the module. Writes live in `prisma-job-store.ts`. */
export function createPrismaJobQueries(prisma: PrismaClient): JobQueries {
  return {
    async listMine(userId, filter) {
      const and: Prisma.JobWhereInput[] = [];
      if (filter.after) {
        const key = new Date(filter.after.key);
        and.push({
          OR: [
            { createdAt: { lt: key } },
            { createdAt: key, id: { gt: filter.after.id } },
          ],
        });
      }
      return prisma.job.findMany({
        where: { postedBy: userId, AND: and },
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        take: filter.limit,
      });
    },

    async get(id) {
      return prisma.job.findUnique({ where: { id } });
    },

    // Implemented in Task 18 (moderation queue) — 7a never calls this path.
    async listPending() {
      throw new Error("listPending: not implemented until slice 7b (Task 18)");
    },

    // Implemented in Task 23 (public listing) — 7a/7b never call this path.
    async listPublished() {
      throw new Error(
        "listPublished: not implemented until slice 7c (Task 23)"
      );
    },
  };
}
