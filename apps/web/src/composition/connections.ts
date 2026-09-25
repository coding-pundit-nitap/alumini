import { addTicks } from "./ticks";
import { audit } from "@/infrastructure/audit";
import { prisma, transactionRunner } from "@/infrastructure/database/client";
import { getMetrics, logger } from "@/infrastructure/observability";
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
  type ConnectionObserver,
} from "@/modules/connections";

/**
 * Wires the connections module to PostgreSQL and the shared Redis rate limiter. `connectionLookup` is what
 * the users module asks ("is this pair blocked or connected?"); it is built here because a module may not
 * import another module (TDS §5.2).
 */
const store = createPrismaConnectionStore({
  runner: transactionRunner,
  outbox,
  audit,
});
/** One log line and one counter per committed outcome (ids only: never a name or address). */
const observe: ConnectionObserver = (outcome, connectionId) => {
  logger.info(`connection.${outcome}`, { metadata: { connectionId } });
  getMetrics().increment("connections_total", { outcome });
};
const queries = createPrismaConnectionQueries(prisma);

export const connectionLookup = { relation: queries.relation };

export const requestConnection = createRequestConnection({
  store,
  authorize,
  rateLimiter: redisRateLimitStorage,
  observe,
});
export const respondToConnection = createRespondToConnection({
  store,
  authorize,
  observe,
});
export const removeConnection = createRemoveConnection({
  store,
  authorize,
  observe,
});
export const blockUser = createBlockUser({ store, authorize, observe });
const listConnectionsBare = createListConnections({ queries, authorize });
export const listConnections: typeof listConnectionsBare = async (args) => {
  const page = await listConnectionsBare(args);
  await addTicks(
    page.data,
    (item) => item.user.id,
    (item) => item.user
  );
  return page;
};
export const getConnectionStatus = createGetConnectionStatus({
  queries,
  authorize,
});
