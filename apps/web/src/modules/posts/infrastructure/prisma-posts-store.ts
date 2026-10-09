import { Prisma, type Post } from "@nitap/database";
import type { AuditWriter } from "@nitap/database/audit";
import type { OutboxWriter } from "@nitap/database/outbox";
import type { OutboxEvent } from "@nitap/jobs";

import type { TransactionRunner } from "@/infrastructure/database/transaction-runner";

import { REACTION_TYPES, type ReactionType } from "../domain/posts";
import type {
  FeedPost,
  PostAuthor,
  PostsStore,
  PostsTx,
} from "../application/posts-store";
import { blockedBetween } from "./sql";

const authorSelect = {
  select: {
    id: true,
    name: true,
    profile: {
      select: { fullName: true, headline: true, photoUploadId: true },
    },
  },
} as const;
type AuthorJoin = {
  id: string;
  name: string;
  profile: {
    fullName: string;
    headline: string | null;
    photoUploadId: string | null;
  } | null;
};
const toAuthor = (u: AuthorJoin): PostAuthor => ({
  id: u.id,
  fullName: u.profile?.fullName ?? u.name,
  headline: u.profile?.headline ?? null,
  hasPhoto: u.profile?.photoUploadId != null,
});

/**
 * The post/comment/reaction tables inside one transaction. `modules/posts` never imports
 * `modules/connections`: blockedBetween reads `connection` directly, the same cross-module-read
 * pattern messaging uses. `uploadsReady` reads `upload` directly for the same reason (no import of
 * `modules/uploads`'s application layer — only its Prisma table, whose shape is stable schema, not module API).
 */
export function createPrismaPostsStore(deps: {
  runner: Pick<TransactionRunner, "run">;
  outbox: OutboxWriter;
  audit: AuditWriter;
}): PostsStore {
  const forClient = (db: Prisma.TransactionClient): PostsTx => {
    /**
     * Joins reaction counts, live comment counts, the viewer's own reaction and any open report onto
     * a batch of posts already loaded with `author` (via `authorSelect`). One round trip per facet,
     * run together, regardless of batch size.
     */
    async function enrich(
      posts: (Post & { author: AuthorJoin })[],
      viewerId: string
    ): Promise<FeedPost[]> {
      if (posts.length === 0) return [];
      const ids = posts.map((post) => post.id);
      const [reactionGroups, commentGroups, myReactions, reports] =
        await Promise.all([
          db.reaction.groupBy({
            by: ["postId", "type"],
            where: { postId: { in: ids } },
            _count: { _all: true },
          }),
          db.comment.groupBy({
            by: ["postId"],
            where: { postId: { in: ids }, deleted: false },
            _count: { _all: true },
          }),
          db.reaction.findMany({
            where: { postId: { in: ids }, userId: viewerId },
            select: { postId: true, type: true },
          }),
          // Read-only join against `report` (no import of modules/moderation — schema, not module API,
          // is the shared contract, same as blockedBetween/uploadsReady above). Oldest-first so
          // `openReportByPostId` below keeps each target's first-filed open report when more than one
          // exists.
          db.report.findMany({
            where: {
              targetType: "POST",
              targetId: { in: ids },
              status: { in: ["OPEN", "UNDER_REVIEW"] },
            },
            orderBy: { createdAt: "asc" },
            select: { id: true, targetId: true },
          }),
        ]);

      const reactionCountsByPost = new Map<
        string,
        Record<ReactionType, number>
      >();
      for (const id of ids) {
        reactionCountsByPost.set(
          id,
          Object.fromEntries(REACTION_TYPES.map((t) => [t, 0])) as Record<
            ReactionType,
            number
          >
        );
      }
      for (const group of reactionGroups) {
        if (!REACTION_TYPES.includes(group.type as ReactionType)) continue;
        const counts = reactionCountsByPost.get(group.postId);
        if (counts) counts[group.type as ReactionType] = group._count._all;
      }

      const commentCountByPost = new Map(
        commentGroups.map((g) => [g.postId, g._count._all])
      );

      const myReactionByPost = new Map<string, ReactionType>();
      for (const r of myReactions) {
        if (REACTION_TYPES.includes(r.type as ReactionType)) {
          myReactionByPost.set(r.postId, r.type as ReactionType);
        }
      }

      const openReportByPostId = new Map<string, string>();
      for (const report of reports) {
        if (!openReportByPostId.has(report.targetId)) {
          openReportByPostId.set(report.targetId, report.id);
        }
      }

      return posts.map(({ author, ...post }) => ({
        ...post,
        author: toAuthor(author),
        reactionCounts: reactionCountsByPost.get(post.id) ?? {
          LIKE: 0,
          CELEBRATE: 0,
          SUPPORT: 0,
          INSIGHTFUL: 0,
        },
        commentCount: commentCountByPost.get(post.id) ?? 0,
        myReaction: myReactionByPost.get(post.id) ?? null,
        openReportId: openReportByPostId.get(post.id) ?? null,
      }));
    }

    return {
      async blockedBetween(x, y) {
        const rows = await db.$queryRaw<{ blocked: boolean }[]>(
          Prisma.sql`SELECT ${blockedBetween(x, y)} AS "blocked"`
        );
        return rows[0]?.blocked ?? false;
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

      async findPost(id, opts) {
        if (opts?.forUpdate) {
          await db.$queryRaw`SELECT 1 FROM "post" WHERE "id" = ${id}::uuid FOR UPDATE`;
        }
        return db.post.findUnique({ where: { id } });
      },

      async audit(entry) {
        await deps.audit.record(db, {
          actorId: entry.actorId,
          action: entry.action,
          targetType: "post",
          targetId: entry.postId,
          metadata: {},
        });
      },

      async listAnnouncements({ limit, after }) {
        const rows = await db.post.findMany({
          where: {
            postType: "ANNOUNCEMENT",
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
          include: { author: authorSelect },
        });
        return rows.map(({ author, ...post }) => ({
          ...post,
          author: toAuthor(author),
        }));
      },

      async findPinnedAnnouncement({ since, viewerId }) {
        const post = await db.post.findFirst({
          where: {
            postType: "ANNOUNCEMENT",
            deleted: false,
            createdAt: { gte: since },
          },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          include: { author: authorSelect },
        });
        return post ? (await enrich([post], viewerId))[0]! : null;
      },

      async findFeedPost(id, viewerId) {
        const post = await db.post.findFirst({
          where: { id, deleted: false },
          include: { author: authorSelect },
        });
        if (!post) return null;
        return (await enrich([post], viewerId))[0]!;
      },

      async findPostImage(uploadId) {
        const upload = await db.upload.findFirst({
          where: { id: uploadId, status: "READY" },
          select: { id: true, objectKey: true },
        });
        if (!upload) return null;
        const count = await db.post.count({
          where: { deleted: false, imageUrls: { has: uploadId } },
        });
        return count > 0 ? { objectKey: upload.objectKey } : null;
      },

      async softDeletePost(id) {
        await db.post.update({ where: { id }, data: { deleted: true } });
      },

      async updatePostContent(id, content) {
        await db.post.update({
          where: { id },
          data: { content, editedAt: new Date() },
        });
      },

      async openReportExists(postId) {
        const report = await db.report.findFirst({
          where: {
            targetType: "POST",
            targetId: postId,
            status: { in: ["OPEN", "UNDER_REVIEW"] },
          },
          select: { id: true },
        });
        return report != null;
      },

      async listFeed({ limit, after, viewerId }) {
        const posts = await db.post.findMany({
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
          include: { author: authorSelect },
        });
        return enrich(posts, viewerId);
      },

      async insertComment(input) {
        const comment = await db.comment.create({
          data: input,
          include: { author: authorSelect },
        });
        const { author, ...c } = comment;
        return { ...c, author: toAuthor(author) };
      },

      async findComment(id) {
        const comment = await db.comment.findUnique({
          where: { id },
          include: { author: authorSelect },
        });
        if (!comment) return null;
        const { author, ...c } = comment;
        return { ...c, author: toAuthor(author) };
      },

      async softDeleteComment(id) {
        await db.comment.update({ where: { id }, data: { deleted: true } });
      },

      async listComments({ postId, limit, after }) {
        const comments = await db.comment.findMany({
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
          include: { author: authorSelect },
        });
        return comments.map(({ author, ...c }) => ({
          ...c,
          author: toAuthor(author),
        }));
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
        // PostsTx.enqueue's `payload: unknown` is narrowed by the caller (each use case builds it with
        // `satisfies <Payload>`); the outbox writer re-validates against the job schema at runtime regardless.
        await deps.outbox.add(db, event as OutboxEvent);
      },
    };
  };

  return {
    transaction: (work) => deps.runner.run((db) => work(forClient(db))),
  };
}
