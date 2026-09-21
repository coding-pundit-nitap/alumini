/** Public API of the messaging module. Other code imports from here, never from the module's internals. */
export {
  createAddParticipant,
  createRemoveParticipant,
} from "./application/manage-participants";
export { createCreateDirectConversation } from "./application/create-direct";
export { createCreateGroupConversation } from "./application/create-group";
export { createGetConversation } from "./application/get-conversation";
export { createListConversations } from "./application/list-conversations";
export { createListMessages } from "./application/list-messages";
export { createMarkRead } from "./application/mark-read";
export { createReportMessage } from "./application/report-message";
export { createSendMessage } from "./application/send-message";
export { createPrismaMessagingQueries } from "./infrastructure/prisma-messaging-queries";
export { createPrismaMessagingStore } from "./infrastructure/prisma-messaging-store";
export { MAX_BODY, MAX_GROUP_SIZE } from "./domain/messaging";
export type {
  ConversationDetail,
  ListedConversation,
  ListedMessage,
  MessagingObserver,
  MessagingOutcome,
  Page,
  Person,
} from "./application/messaging-store";
