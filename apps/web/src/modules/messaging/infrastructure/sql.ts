import { Prisma } from "@nitap/database";

/** A trusted SQL column expression (never user input). */
export const col = (name: string) => Prisma.raw(name);
export const uuid = (value: string) => Prisma.sql`${value}::uuid`;

/** Pairs are stored in canonical order, hence LEAST/GREATEST. */
export const blockedBetween = (a: Prisma.Sql, b: Prisma.Sql) =>
  Prisma.sql`EXISTS (SELECT 1 FROM "connection" bc WHERE bc."state" = 'BLOCKED' AND bc."user_a_id" = LEAST(${a}, ${b}) AND bc."user_b_id" = GREATEST(${a}, ${b}))`;

/**
 * Unread messages for one participant row `p`: from others, past the read
 * marker, from nobody blocked with them.
 */
export const unreadCountFor = (marker: Prisma.Sql) =>
  Prisma.sql`(SELECT count(*)::int FROM "message" m WHERE m."conversation_id" = p."conversation_id" AND m."sender_id" <> p."user_id" AND m."seq" > ${marker} AND NOT ${blockedBetween(col('m."sender_id"'), col('p."user_id"'))})`;
