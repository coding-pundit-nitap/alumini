import { Prisma } from "@nitap/database";

import type { ModerationTarget, ReportTargetType } from "../domain/moderation";

/** Cross-module reads/writes by SQL — modules/moderation never imports posts, messaging or users. */
export function findContentAuthor(
  targetType: ReportTargetType,
  targetId: string
) {
  switch (targetType) {
    case "POST":
      return Prisma.sql`SELECT author_id AS "authorId" FROM "post" WHERE id = ${targetId}::uuid`;
    case "COMMENT":
      return Prisma.sql`SELECT author_id AS "authorId" FROM "comment" WHERE id = ${targetId}::uuid`;
    case "MESSAGE":
      return Prisma.sql`SELECT sender_id AS "authorId" FROM "message" WHERE id = ${targetId}::uuid`;
    case "USER":
      return Prisma.sql`SELECT id AS "authorId" FROM "user" WHERE id = ${targetId}::uuid`;
  }
}

export const softDeleteContentSql = (
  targetType: ModerationTarget,
  targetId: string
) =>
  targetType === "POST"
    ? Prisma.sql`UPDATE "post" SET deleted = true WHERE id = ${targetId}::uuid`
    : Prisma.sql`UPDATE "comment" SET deleted = true WHERE id = ${targetId}::uuid`;

/** Guarded: an already hidden message is left alone (spec: hiding twice is a no-op). */
export const hideMessageSql = (messageId: string) =>
  Prisma.sql`UPDATE "message" SET hidden_at = now() WHERE id = ${messageId}::uuid AND hidden_at IS NULL`;

/** Owner and preview of each reported target, one round trip. MESSAGE never selects its body. */
export const reportTargetsSql = (
  ids: Record<ReportTargetType, string[]>
) => Prisma.sql`
  SELECT 'POST' AS "type", id, author_id AS "ownerId", left(content, 140) AS "text", deleted
    FROM "post" WHERE id = ANY(${ids.POST}::uuid[])
  UNION ALL SELECT 'COMMENT', id, author_id, left(body, 140), deleted
    FROM "comment" WHERE id = ANY(${ids.COMMENT}::uuid[])
  UNION ALL SELECT 'MESSAGE', id, sender_id, NULL, false
    FROM "message" WHERE id = ANY(${ids.MESSAGE}::uuid[])
  UNION ALL SELECT 'USER', id, id, name, false
    FROM "user" WHERE id = ANY(${ids.USER}::uuid[])`;
