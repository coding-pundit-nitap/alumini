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

    async listPending(filter) {
      const and: Prisma.JobWhereInput[] = [];
      if (filter.after) {
        const key = new Date(filter.after.key);
        and.push({
          OR: [
            { createdAt: { gt: key } },
            { createdAt: key, id: { gt: filter.after.id } },
          ],
        });
      }
      return prisma.job.findMany({
        where: { status: "PENDING_REVIEW", AND: and },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        take: filter.limit,
      });
    },

    async listPublished(filter) {
      const today = new Date();
      const currentDate = new Date(
        Date.UTC(
          today.getUTCFullYear(),
          today.getUTCMonth(),
          today.getUTCDate()
        )
      );
      const and: Prisma.JobWhereInput[] = [{ deadline: { gte: currentDate } }];
      if (filter.employmentType)
        and.push({ employmentType: filter.employmentType });
      if (filter.workMode) and.push({ workMode: filter.workMode });
      if (filter.location) {
        and.push({
          location: { equals: filter.location, mode: "insensitive" },
        });
      }
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
        where: { status: "PUBLISHED", AND: and },
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        take: filter.limit,
        select: {
          id: true,
          title: true,
          company: true,
          description: true,
          employmentType: true,
          location: true,
          workMode: true,
          experience: true,
          skills: true,
          applicationUrl: true,
          deadline: true,
          createdAt: true,
        },
      });
    },
  };
}
