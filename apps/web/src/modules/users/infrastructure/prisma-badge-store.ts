import type { PrismaClient } from "@nitap/database";

import type { BadgeStore } from "../application/badge-role";

/** Reads the member's role names and `profile.badge_role`; writes only that one column. */
export function createPrismaBadgeStore(prisma: PrismaClient): BadgeStore {
  return {
    async readChoice(userId) {
      const profile = await prisma.profile.findUnique({
        where: { userId },
        select: {
          badgeRole: true,
          user: {
            select: {
              userRoles: { select: { role: { select: { name: true } } } },
            },
          },
        },
      });
      if (!profile) return null;
      return {
        preference: profile.badgeRole,
        roles: profile.user.userRoles.map((ur) => ur.role.name),
      };
    },
    async setChoice(userId, preference) {
      const result = await prisma.profile.updateMany({
        where: { userId },
        data: { badgeRole: preference },
      });
      return result.count > 0;
    },
  };
}
