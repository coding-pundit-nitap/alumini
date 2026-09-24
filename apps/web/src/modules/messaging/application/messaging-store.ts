import type { MessageSentPayload } from "@nitap/jobs";

import type { ListedMessage } from "../domain/messaging";

export type { ListedMessage };

export type ConversationRow = {
  id: string;
  createdById: string;
  isGroup: boolean;
  title: string | null;
  lastMessageSeq: string;
};
export type MessageRow = {
  id: string;
  seq: string;
  conversationId: string;
  senderId: string;
  body: string;
  clientMessageId: string;
  createdAt: Date;
};
export type MessagingTx = {
  accountState(userId: string): Promise<string | null>;
  /** The BLOCKED connection row between two members, or null. */
  blockBetween(x: string, y: string): Promise<{ blockedById: string } | null>;
  anyBlockAmong(userIds: string[]): Promise<boolean>;
  anyBlockWith(userId: string, others: string[]): Promise<boolean>;
  /** Locks the conversation row (FOR UPDATE): sends, adds and read-marks on it are serialised. */
  lockConversation(id: string): Promise<ConversationRow | null>;
  participantIds(conversationId: string): Promise<string[]>;
  getOrCreateDirect(
    creatorId: string,
    otherId: string
  ): Promise<{ id: string; created: boolean }>;
  createGroup(input: {
    creatorId: string;
    title: string | null;
    memberIds: string[];
  }): Promise<{ id: string }>;
  /** Joins with the read marker already at `lastReadSeq`: a new member does not inherit the backlog as unread. */
  addParticipant(
    conversationId: string,
    userId: string,
    lastReadSeq: string
  ): Promise<boolean>;
  removeParticipant(conversationId: string, userId: string): Promise<boolean>;
  findMessageByClientId(
    conversationId: string,
    senderId: string,
    clientMessageId: string
  ): Promise<MessageRow | null>;
  insertMessage(input: {
    conversationId: string;
    senderId: string;
    body: string;
    clientMessageId: string;
  }): Promise<MessageRow>;
  /** Sets the conversation's last-message fields and bumps unread for everyone but the sender (and blocked pairs). */
  recordSend(message: MessageRow): Promise<void>;
  markRead(
    conversationId: string,
    userId: string,
    upToSeq: string
  ): Promise<void>;
  rebuildUnread(conversationId: string): Promise<void>;
  messageTarget(
    messageId: string
  ): Promise<{ conversationId: string; senderId: string } | null>;
  insertReport(input: {
    reporterId: string;
    messageId: string;
    reason: string;
  }): Promise<{ id: string; created: boolean }>;
  enqueue(event: {
    type: "message.sent";
    payload: MessageSentPayload;
  }): Promise<void>;
  /** The MESSAGE report's message, or null (unknown report, other type, or the message is gone). */
  reportedMessage(
    reportId: string
  ): Promise<{ messageId: string; conversationId: string; seq: string } | null>;
  /** Oldest first: up to `eachSide` before `seq`, the message at `seq`, up to `eachSide` after. One conversation only. */
  messageContext(
    conversationId: string,
    seq: string,
    eachSide: number
  ): Promise<Omit<ContextMessage, "reported">[]>;
  audit(entry: {
    action: "message.read_reported";
    actorId: string;
    messageId: string;
    reportId: string;
  }): Promise<void>;
};

export type MessagingStore = {
  transaction<T>(work: (tx: MessagingTx) => Promise<T>): Promise<T>;
};

export type MessagingOutcome =
  | "sent"
  | "conversation_created"
  | "read"
  | "participant_added"
  | "participant_removed"
  | "reported";
export type MessagingObserver = (outcome: MessagingOutcome, id: string) => void;

export type Person = { id: string; fullName: string; hasPhoto: boolean };
export type ListedConversation = {
  id: string;
  isGroup: boolean;
  title: string | null;
  participants: Person[];
  unreadCount: number;
  lastMessageSeq: string;
  lastMessageAt: Date | null;
};
export type ConversationDetail = ListedConversation & {
  createdById: string;
  lastReadSeq: string;
};
export type MessagingQueries = {
  /** Conversations with at least one message, newest activity first. Hides 1:1s whose other side blocked the viewer. */
  listConversations(
    viewerId: string,
    filter: { limit: number; before?: string }
  ): Promise<ListedConversation[]>;
  getConversation(
    viewerId: string,
    conversationId: string
  ): Promise<ConversationDetail | null>;
  /** Newest first; null when the viewer cannot see the conversation. Hides messages from anyone blocked with the viewer. */
  listMessages(
    viewerId: string,
    conversationId: string,
    filter: { limit: number; before?: string }
  ): Promise<ListedMessage[] | null>;
};
export type ContextMessage = {
  id: string;
  seq: string;
  senderId: string;
  senderName: string;
  /** The real text, hidden or not: the moderator needs to see what was hidden (spec C12-6). */
  body: string;
  createdAt: Date;
  hidden: boolean;
  reported: boolean;
};
export type ReportedMessageView = {
  reportId: string;
  conversationId: string;
  messageId: string;
  messages: ContextMessage[];
};

export type Page<T> = {
  data: T[];
  page: { limit: number; nextCursor: string | null; hasMore: boolean };
};
