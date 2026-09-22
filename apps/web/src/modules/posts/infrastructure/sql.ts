import { Prisma } from "@nitap/database";

/** Same shape as messaging's blockedBetween (infrastructure/sql.ts) — the canonical-order BLOCKED lookup. */
export const blockedBetween = (a: string, b: string) => Prisma.sql`
  EXISTS (SELECT 1 FROM "connection" c WHERE c."state" = 'BLOCKED'
    AND c."user_a_id" = LEAST(${a}::uuid, ${b}::uuid) AND c."user_b_id" = GREATEST(${a}::uuid, ${b}::uuid))`;
