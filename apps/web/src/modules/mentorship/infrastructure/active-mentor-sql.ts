import { Prisma } from "@nitap/database";
import { PERMISSIONS } from "@nitap/database/permissions";

/**
 * "Active mentor" minus availability: a verified account that holds `mentorship.respond` through a
 * role. Roles are never named here: the permission is what defines a mentor. `accepting` and open
 * slots are checked by the callers, which read them anyway.
 */
export function activeMentorSql(userAlias: string) {
  const u = Prisma.raw(userAlias);
  return Prisma.sql`(${u}.account_state = 'VERIFIED' AND EXISTS (
    SELECT 1 FROM user_role ur JOIN role_permission rp ON rp.role_id = ur.role_id
    WHERE ur.user_id = ${u}.id AND rp.permission = ${PERMISSIONS.MENTORSHIP_RESPOND}))`;
}
