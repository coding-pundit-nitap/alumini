/**
 * Server-only public API of the donations module: composition roots import from here (it reaches the
 * generated Prisma client at runtime; see modules/moderation/index.ts).
 */
export {
  createPrismaDonationQueries,
  createPrismaDonationStore,
} from "./infrastructure/prisma-donation-store";
