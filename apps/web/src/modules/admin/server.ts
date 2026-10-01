/**
 * Server-only public API of the admin module: composition roots import from here. Kept out of `./index.ts`
 * because it reaches `@nitap/database`'s generated Prisma client at runtime (see modules/moderation/index.ts).
 */
export { createPrismaAdminStore } from "./infrastructure/prisma-admin-store";
export { createPrismaAccessStore } from "./infrastructure/prisma-access-store";
export { createPrismaAnalyticsStore } from "./infrastructure/prisma-analytics-store";
export { createPrismaSettingsStore } from "./infrastructure/prisma-settings-store";
