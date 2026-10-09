import type { PrismaClient } from "@nitap/database";

import { logger } from "@/infrastructure/observability";

import type { GrantSource } from "../application/grant-source";
import type { Grant } from "../domain/actor";
import { isPermission } from "../domain/permission";

/**
 * Effective grants = role-derived ∪ direct (`permission_grant`), excluding expired ones.
 * Role permissions are GLOBAL and never expire. Permission names are validated against the registry
 * because PostgreSQL does not; an unknown name is dropped and logged, never trusted.
 */
export function createPrismaGrantSource(prisma: PrismaClient): GrantSource {
  return {
    async loadGrants(userId, now) {
      const [rolePermissions, directGrants] = await Promise.all([
        prisma.rolePermission.findMany({
          where: { role: { userRoles: { some: { userId } } } },
          select: { permission: true },
        }),
        prisma.permissionGrant.findMany({
          where: {
            userId,
            OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
          },
          select: {
            permission: true,
            scopeType: true,
            chapterId: true,
            expiresAt: true,
          },
        }),
      ]);

      const grants: Grant[] = [];
      const drop = (permission: string) =>
        logger.warn("authz.grant.unknown_permission", {
          metadata: { userId, permission },
        });

      for (const { permission } of rolePermissions) {
        if (!isPermission(permission)) {
          drop(permission);
          continue;
        }
        grants.push({ permission, scope: "GLOBAL", expiresAt: null });
      }

      for (const grant of directGrants) {
        if (!isPermission(grant.permission)) {
          drop(grant.permission);
          continue;
        }
        if (grant.scopeType === "CHAPTER" && grant.chapterId !== null) {
          grants.push({
            permission: grant.permission,
            scope: "CHAPTER",
            chapterId: grant.chapterId,
            expiresAt: grant.expiresAt,
          });
        } else if (grant.scopeType === "GLOBAL") {
          grants.push({
            permission: grant.permission,
            scope: "GLOBAL",
            expiresAt: grant.expiresAt,
          });
        }
        // A CHAPTER grant without a chapter cannot exist (ck_grant_scope); anything else is ignored.
      }
      return grants;
    },
  };
}
