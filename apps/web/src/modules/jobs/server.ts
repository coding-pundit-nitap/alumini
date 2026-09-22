/**
 * Server-only public API of the jobs module: composition roots (never client components) import from
 * here. Kept out of `./index.ts` because it reaches `@nitap/database`'s generated Prisma client at
 * runtime, which cannot be bundled for the browser (same reasoning as `modules/moderation/server.ts`).
 */
export { createPrismaJobStore } from "./infrastructure/prisma-job-store";
export { createPrismaJobQueries } from "./infrastructure/prisma-job-queries";
