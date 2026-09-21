import { prisma, transactionRunner } from "@/infrastructure/database/client";
import { outbox } from "@/infrastructure/outbox";
import { redisRateLimitStorage } from "@/infrastructure/redis/rate-limit-storage";
import { authorize } from "@/modules/auth";
import {
  createBlockUser,
  createGetConnectionStatus,
  createListConnections,
  createPrismaConnectionQueries,
  createPrismaConnectionStore,
  createRemoveConnection,
  createRequestConnection,
  createRespondToConnection,
} from "@/modules/connections";

/**
 * Wires the connections module to PostgreSQL and the shared Redis rate limiter. `connectionLookup` is what
 * the users module asks ("is this pair blocked or connected?"); it is built here because a module may not
 * import another module (TDS §5.2).
 */
const store = createPrismaConnectionStore({
  runner: transactionRunner,
  outbox,
});
const queries = createPrismaConnectionQueries(prisma);

export const connectionLookup = { relation: queries.relation };

export const requestConnection = createRequestConnection({
  store,
  authorize,
  rateLimiter: redisRateLimitStorage,
});
export const respondToConnection = createRespondToConnection({
  store,
  authorize,
});
export const removeConnection = createRemoveConnection({ store, authorize });
export const blockUser = createBlockUser({ store, authorize });
export const listConnections = createListConnections({ queries, authorize });
export const getConnectionStatus = createGetConnectionStatus({
  queries,
  authorize,
});
