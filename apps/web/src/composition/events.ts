import { prisma, transactionRunner } from "@/infrastructure/database/client";
import { getMetrics, logger } from "@/infrastructure/observability";
import { outbox } from "@/infrastructure/outbox";
import { redisRateLimitStorage } from "@/infrastructure/redis/rate-limit-storage";
import { authorize, can } from "@/modules/auth";
import {
  createCreateEvent,
  createGetEvent,
  createListEvents,
  createPrismaEventQueries,
  createPrismaEventStore,
  type EventObserver,
} from "@/modules/events";

/** Wires the events module to PostgreSQL and the shared Redis rate limiter. */
const store = createPrismaEventStore({ runner: transactionRunner, outbox });
const queries = createPrismaEventQueries(prisma);

/** One log line and one counter per committed outcome (ids only: never a title or a name). */
const observe: EventObserver = (outcome, eventId) => {
  logger.info(`event.${outcome}`, { metadata: { eventId } });
  getMetrics().increment("event_total", { outcome });
};

export const createEvent = createCreateEvent({
  store,
  authorize,
  rateLimiter: redisRateLimitStorage,
  observe,
});
export const getEvent = createGetEvent({ queries, authorize, can });
export const listEvents = createListEvents({ queries, authorize });
