import { Prisma } from "@nitap/database";

/** Cross-module reads/writes against post/comment — modules/moderation never imports modules/posts. */
export const findContentAuthor = (
  targetType: "POST" | "COMMENT",
  targetId: string
) =>
  targetType === "POST"
    ? Prisma.sql`SELECT author_id AS "authorId" FROM "post" WHERE id = ${targetId}::uuid`
    : Prisma.sql`SELECT author_id AS "authorId" FROM "comment" WHERE id = ${targetId}::uuid`;

export const softDeleteContentSql = (
  targetType: "POST" | "COMMENT",
  targetId: string
) =>
  targetType === "POST"
    ? Prisma.sql`UPDATE "post" SET deleted = true WHERE id = ${targetId}::uuid`
    : Prisma.sql`UPDATE "comment" SET deleted = true WHERE id = ${targetId}::uuid`;
