import type { PrismaClient } from "@nitap/database";

import { pickTick, type Tick, type TickLoader } from "@/lib/role-tick";

/** One query per batch of users; the rules live in `pickTick`. */
export function createTickLoader(prisma: PrismaClient): TickLoader {
  return async (userIds) => {
    const ticks = new Map<string, Tick>();
    if (userIds.length === 0) return ticks;
    const rows = await prisma.$queryRaw<
      {
        id: string;
        verified: boolean;
        preference: string | null;
        roles: string[];
      }[]
    >`
      select u.id,
             u.account_state = 'VERIFIED' as verified,
             p.badge_role as preference,
             coalesce(array_agg(r.name) filter (where r.name is not null), '{}') as roles
      from "user" u
      left join profile p on p.user_id = u.id
      left join user_role ur on ur.user_id = u.id
      left join role r on r.id = ur.role_id
      where u.id = any(${[...userIds]}::uuid[])
      group by u.id, u.account_state, p.badge_role`;
    for (const row of rows) {
      const tick = pickTick(row);
      if (tick) ticks.set(row.id, tick);
    }
    return ticks;
  };
}
