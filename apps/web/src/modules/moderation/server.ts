/**
 * Server-only public API of the moderation module: composition roots (never client components) import
 * from here. Kept out of `./index.ts` because it reaches `@nitap/database`'s generated Prisma client at
 * runtime, which cannot be bundled for the browser (see the note in `./index.ts`).
 */
export { createPrismaModerationStore } from "./infrastructure/prisma-moderation-store";
