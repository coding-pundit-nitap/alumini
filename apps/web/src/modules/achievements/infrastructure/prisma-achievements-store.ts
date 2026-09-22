import type {
  AchievementCategory,
  AchievementStatus,
  Prisma,
} from "@nitap/database";
import type { OutboxWriter } from "@nitap/database/outbox";
import type { OutboxEvent } from "@nitap/jobs";

import type { TransactionRunner } from "@/infrastructure/database/transaction-runner";

import type {
  AchievementsStore,
  AchievementsTx,
} from "../application/achievements-store";

/** achievement + the Post row it publishes (C-12), in one transaction; the Post write is direct Prisma
 * access to the `post` table (no import of modules/posts — schema, not module API, is the shared contract). */
export function createPrismaAchievementsStore(deps: {
  runner: Pick<TransactionRunner, "run">;
  outbox: OutboxWriter;
}): AchievementsStore {
  const forClient = (db: Prisma.TransactionClient): AchievementsTx => ({
    async insertAchievement(input) {
      return db.achievement.create({
        data: {
          ...input,
          category: input.category as AchievementCategory,
          status: "SUBMITTED",
        },
      });
    },
    async findAchievement(id) {
      return db.achievement.findUnique({ where: { id } });
    },
    async patchAchievement(id, patch) {
      await db.achievement.update({
        where: { id },
        data: { ...patch, status: patch.status as AchievementStatus },
      });
    },
    async publishAsPost(_achievementId, input) {
      const post = await db.post.create({
        data: {
          authorId: input.authorId,
          content: `${input.title}\n\n${input.description}`,
          postType: "ACHIEVEMENT",
        },
      });
      return { postId: post.id };
    },
    async listOwn(userId, { limit, after }) {
      return db.achievement.findMany({
        where: {
          userId,
          ...(after
            ? {
                OR: [
                  { createdAt: { lt: after.createdAt } },
                  { createdAt: after.createdAt, id: { lt: after.id } },
                ],
              }
            : {}),
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: limit,
      });
    },
    async listPending({ limit, after }) {
      return db.achievement.findMany({
        where: {
          status: "SUBMITTED",
          ...(after
            ? {
                OR: [
                  { createdAt: { lt: after.createdAt } },
                  { createdAt: after.createdAt, id: { lt: after.id } },
                ],
              }
            : {}),
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: limit,
      });
    },
    async enqueue(event) {
      await deps.outbox.add(db, event as OutboxEvent);
    },
  });

  return {
    transaction: (work) => deps.runner.run((db) => work(forClient(db))),
  };
}
