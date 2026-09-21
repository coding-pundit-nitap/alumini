import { prisma, transactionRunner } from "@/infrastructure/database/client";
import { getMetrics, logger } from "@/infrastructure/observability";
import { outbox } from "@/infrastructure/outbox";
import { redisRateLimitStorage } from "@/infrastructure/redis/rate-limit-storage";
import { authorize } from "@/modules/auth";
import {
  createAddParticipant,
  createCreateDirectConversation,
  createCreateGroupConversation,
  createGetConversation,
  createListConversations,
  createListMessages,
  createMarkRead,
  createPrismaMessagingQueries,
  createPrismaMessagingStore,
  createRemoveParticipant,
  createReportMessage,
  createSendMessage,
  type MessagingObserver,
} from "@/modules/messaging";

/** Wires the messaging module to PostgreSQL and the shared Redis rate limiter. */
const store = createPrismaMessagingStore({ runner: transactionRunner, outbox });
const queries = createPrismaMessagingQueries(prisma);
/** One log line and one counter per committed outcome (ids only: never a body or a name). */
const observe: MessagingObserver = (outcome, id) => {
  logger.info(`messaging.${outcome}`, { metadata: { id } });
  getMetrics().increment("messaging_total", { outcome });
};
const withLimiter = {
  store,
  authorize,
  rateLimiter: redisRateLimitStorage,
  observe,
};

export const createDirectConversation =
  createCreateDirectConversation(withLimiter);
export const createGroupConversation =
  createCreateGroupConversation(withLimiter);
export const sendMessage = createSendMessage(withLimiter);
export const markRead = createMarkRead({ store, authorize, observe });
export const addParticipant = createAddParticipant({
  store,
  authorize,
  observe,
});
export const removeParticipant = createRemoveParticipant({
  store,
  authorize,
  observe,
});
export const reportMessage = createReportMessage({ store, authorize, observe });
export const listConversations = createListConversations({
  queries,
  authorize,
});
export const getConversation = createGetConversation({ queries, authorize });
export const listMessages = createListMessages({ queries, authorize });
