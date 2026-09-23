/**
 * Public API of the admin module (client-safe). Server-only exports (the Prisma store) live in
 * `./server.ts`, for the same reason as `modules/moderation` (see its index note).
 */
export {
  ADMIN_PERMISSIONS,
  adminNavigation,
  dashboardTiles,
  hasAdminAccess,
} from "./domain/access";
export type { Can, NavIcon, NavItem, TileKey } from "./domain/access";
