import { Prisma } from "@nitap/database";
import type { OutboxWriter } from "@nitap/database/outbox";

import type { TransactionRunner } from "@/infrastructure/database/transaction-runner";

import type {
  CommentRow,
  PostRow,
  PostsStore,
  PostsTx,
} from "../application/posts-store";
import { blockedBetween } from "./sql";

/**
 * The post/comment/reaction tables inside one transaction. `modules/posts` never imports
 * `modules/connections`: blockedBetween reads `connection` directly, the same cross-module-read
 * pattern messaging uses. `uploadsReady` reads `upload` directly for the same reason (no import of
 * `modules/uploads`'s application layer — only its Prisma table, whose shape is stable schema, not module API).
 */
export function createPrismaPostsStore(deps: {
  runner: Pick<TransactionRunner, "run">;
  outbox: OutboxWriter;
}): PostsStore {
  const forClient = (db: Prisma.TransactionClient): PostsTx => ({
    async blockedBetween(x, y) {
      const rows = await db.$queryRaw<unknown[]>(blockedBetween(x, y));
      return rows.length > 0;
    },

    async uploadsReady(ids, ownerId) {
      if (ids.length === 0) return true;
      const count = await db.upload.count({
        where: { id: { in: ids }, ownerId, status: "READY" },
      });
      return count === ids.length;
    },

    async insertPost(input) {
      return db.post.create({ data: input });
    },

    async findPost(id) {
      return db.post.findUnique({ where: { id } });
    },

    async softDeletePost(id) {
      await db.post.update({ where: { id }, data: { deleted: true } });
    },

    async listFeed({ limit, after }) {
      return db.post.findMany({
        where: {
          deleted: false,
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

    async insertComment(input) {
      return db.comment.create({ data: input });
    },

    async findComment(id) {
      return db.comment.findUnique({ where: { id } });
    },

    async softDeleteComment(id) {
      await db.comment.update({ where: { id }, data: { deleted: true } });
    },

    async listComments({ postId, limit, after }) {
      return db.comment.findMany({
        where: {
          postId,
          deleted: false,
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

    async upsertReaction({ postId, userId, type }) {
      return db.reaction.upsert({
        where: { postId_userId: { postId, userId } },
        create: { postId, userId, type },
        update: { type },
        select: { id: true },
      });
    },

    async deleteReaction(postId, userId) {
      await db.reaction.deleteMany({ where: { postId, userId } });
    },

    async enqueue(event) {
      await deps.outbox.add(db, event);
    },
  });

  return {
    transaction: (work) => deps.runner.run((db) => work(forClient(db))),
  };
}
