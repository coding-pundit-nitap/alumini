import { Prisma } from "@nitap/database";

/**
 * The visibility rules of a profile as SQL fragments, for the directory and mentor discovery.
 * `alias` is the SQL alias of a `profile` row. Level order is the enum's declaration order, so
 * "MEMBERS_ONLY or looser" is `<=`. A block hides both members from each other, in either direction.
 */
export function profileVisibilitySql(viewerId: string) {
  const reach = Prisma.sql`'MEMBERS_ONLY'::"ProfileVisibility"`;

  // Membership in the viewer's own pairs in that state, read through ix_connection_user_a / _b. Not a correlated
  // EXISTS on the pair: under an OR (visibleAt) PostgreSQL hashes that subquery over EVERY pair in the network, a
  // full scan of `connection` per request. The viewer's set is a few dozen rows at most.
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
