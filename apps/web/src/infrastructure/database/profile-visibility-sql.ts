import { Prisma } from "@nitap/database";

/**
 * Profile visibility rules as SQL fragments. Visibility levels compare in enum order, and a block hides
 * both members from each other.
 */
export function profileVisibilitySql(viewerId: string) {
  const reach = Prisma.sql`'MEMBERS_ONLY'::"ProfileVisibility"`;

  // A plain membership check, not a correlated EXISTS: under the OR, PostgreSQL would hash every pair in
  // the network.
  const pairWith = (alias: string, state: "ACCEPTED" | "BLOCKED") =>
    Prisma.sql`${Prisma.raw(alias)}.user_id IN (
      SELECT CASE WHEN c.user_a_id = ${viewerId}::uuid THEN c.user_b_id ELSE c.user_a_id END
      FROM connection c
      WHERE (c.user_a_id = ${viewerId}::uuid OR c.user_b_id = ${viewerId}::uuid)
        AND c.state = ${state}::"ConnectionState")`;

  // A level is visible when it is MEMBERS_ONLY or looser, or CONNECTIONS_ONLY and the two are connected.
  const visibleAt = (level: Prisma.Sql, alias: string) =>
    Prisma.sql`(${level} <= ${reach} OR (${level} = 'CONNECTIONS_ONLY'::"ProfileVisibility" AND ${pairWith(alias, "ACCEPTED")}))`;

  const sectionVisible = (column: string, alias = "p") =>
    visibleAt(
      Prisma.sql`COALESCE(${Prisma.raw(`${alias}.${column}_visibility`)}, ${Prisma.raw(`${alias}.visibility`)})`,
      alias
    );

  return { pairWith, visibleAt, sectionVisible };
}
