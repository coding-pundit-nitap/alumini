import { Prisma } from "@nitap/database";
import { PERMISSIONS } from "@nitap/database/permissions";

/**
 * A verified account holding `mentorship.respond` through a role. Callers check
 * `accepting` and slots.
 */
export function activeMentorSql(userAlias: string) {
  const u = Prisma.raw(userAlias);
  return Prisma.sql`(${u}.account_state = 'VERIFIED' AND EXISTS (
    SELECT 1 FROM user_role ur JOIN role_permission rp ON rp.role_id = ur.role_id
    WHERE ur.user_id = ${u}.id AND rp.permission = ${PERMISSIONS.MENTORSHIP_RESPOND}))`;
}
