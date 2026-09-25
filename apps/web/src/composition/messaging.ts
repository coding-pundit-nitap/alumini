import { addTicks } from "./ticks";
import { debounceKeyFor } from "@nitap/jobs";

import { audit } from "@/infrastructure/audit";
import { prisma, transactionRunner } from "@/infrastructure/database/client";
import { getMetrics, logger } from "@/infrastructure/observability";
import { outbox } from "@/infrastructure/outbox";
import { getRedis } from "@/infrastructure/redis/client";
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
  createReadReportedMessage,
  createRemoveParticipant,
  createReportMessage,
  createSendMessage,
  type MessagingObserver,
} from "@/modules/messaging";

/** Wires the messaging module to PostgreSQL and the shared Redis rate limiter. */
const store = createPrismaMessagingStore({
  runner: transactionRunner,
  outbox,
  audit,
});
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
export const markRead = createMarkRead({
  store,
  authorize,
  observe,
  // N-7: reading the conversation ends the recipient's email debounce window.
  onRead: async (userId, conversationId) => {
    try {
      await (await getRedis()).del(debounceKeyFor(userId, conversationId));
    } catch (error) {
      logger.warn("messaging.debounce_clear_failed", {
        metadata: { message: (error as Error).message },
      });
    }
  },
});
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
const listConversationsBare = createListConversations({
  queries,
  authorize,
});
export const listConversations: typeof listConversationsBare = async (args) => {
  const page = await listConversationsBare(args);
  await addTicks(
    page.data.flatMap((c) => c.participants),
    (person) => person.id
  );
  return page;
};
const getConversationBare = createGetConversation({ queries, authorize });
export const getConversation: typeof getConversationBare = async (args) => {
  const conversation = await getConversationBare(args);
  await addTicks(conversation.participants, (person) => person.id);
  return conversation;
};
export const listMessages = createListMessages({ queries, authorize });
export const readReportedMessage = createReadReportedMessage({
  store,
  authorize,
});
