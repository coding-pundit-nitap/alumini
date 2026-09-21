import { Prisma } from "@nitap/database";

/**
 * The visibility rules of a profile as SQL fragments, for the directory and mentor discovery (RBAC §6.1).
 * `alias` is the SQL alias of a `profile` row. Level order is the enum's declaration order, so
 * "MEMBERS_ONLY or looser" is `<=`. A block hides both members from each other, in either direction.
 */
export function profileVisibilitySql(viewerId: string) {
  const reach = Prisma.sql`'MEMBERS_ONLY'::"ProfileVisibility"`;

  // The pair's connection row, by canonical order (uq_connection_pair serves the lookup).
  const pairWith = (alias: string, state: "ACCEPTED" | "BLOCKED") =>
    Prisma.sql`EXISTS (SELECT 1 FROM connection c
      WHERE c.user_a_id = LEAST(${viewerId}::uuid, ${Prisma.raw(alias)}.user_id)
        AND c.user_b_id = GREATEST(${viewerId}::uuid, ${Prisma.raw(alias)}.user_id)
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
