import { Prisma } from "@nitap/database";

/** The canonical-order BLOCKED lookup, as in messaging. */
export const blockedBetween = (a: string, b: string) => Prisma.sql`
  EXISTS (SELECT 1 FROM "connection" c WHERE c."state" = 'BLOCKED'
    AND c."user_a_id" = LEAST(${a}::uuid, ${b}::uuid) AND c."user_b_id" = GREATEST(${a}::uuid, ${b}::uuid))`;
