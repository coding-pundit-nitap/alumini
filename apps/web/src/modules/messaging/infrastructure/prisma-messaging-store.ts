import { Prisma } from "@nitap/database";
import type { OutboxWriter } from "@nitap/database/outbox";

import type { TransactionRunner } from "@/infrastructure/database/transaction-runner";

import type {
  ConversationRow,
  MessageRow,
  MessagingStore,
  MessagingTx,
} from "../application/messaging-store";
import { directPairKey } from "../domain/messaging";
import { blockedBetween, col, unreadCountFor, uuid } from "./sql";

const toMessage = (row: {
  id: string;
  seq: bigint;
  conversationId: string;
  senderId: string;
  body: string;
  clientMessageId: string;
  createdAt: Date;
}): MessageRow => ({ ...row, seq: row.seq.toString() });

/**
 * The messaging tables inside one transaction. Every write that touches a conversation's counters first
 * takes `lockConversation` (FOR UPDATE), so sends, adds and read-marks on one conversation are serialised:
 * `seq` is then commit-ordered within it, and counters cannot be lost. The outbox event is written on the
 * same client, so it commits or rolls back with the message.
 */
export function createPrismaMessagingStore(deps: {
  runner: Pick<TransactionRunner, "run">;
  outbox: OutboxWriter;
}): MessagingStore {
  const forClient = (db: Prisma.TransactionClient): MessagingTx => ({
    async accountState(userId) {
      const user = await db.user.findUnique({
        where: { id: userId },
        select: { accountState: true },
      });
      return user?.accountState ?? null;
    },

    async blockBetween(x, y) {
      const rows = await db.$queryRaw<{ blockedById: string }[]>`
        SELECT blocked_by_id AS "blockedById" FROM "connection"
        WHERE state = 'BLOCKED' AND user_a_id = LEAST(${x}::uuid, ${y}::uuid) AND user_b_id = GREATEST(${x}::uuid, ${y}::uuid)`;
      return rows[0] ?? null;
    },

    async anyBlockAmong(userIds) {
      const rows = await db.$queryRaw<unknown[]>`
        SELECT 1 FROM "connection"
        WHERE state = 'BLOCKED' AND user_a_id = ANY(${userIds}::uuid[]) AND user_b_id = ANY(${userIds}::uuid[]) LIMIT 1`;
      return rows.length > 0;
    },

    async anyBlockWith(userId, others) {
      const rows = await db.$queryRaw<unknown[]>`
        SELECT 1 FROM "connection"
        WHERE state = 'BLOCKED'
          AND ((user_a_id = ${userId}::uuid AND user_b_id = ANY(${others}::uuid[]))
            OR (user_b_id = ${userId}::uuid AND user_a_id = ANY(${others}::uuid[]))) LIMIT 1`;
      return rows.length > 0;
    },

    async lockConversation(id) {
      const rows = await db.$queryRaw<ConversationRow[]>`
        SELECT id, created_by_id AS "createdById", is_group AS "isGroup", title, last_message_seq::text AS "lastMessageSeq"
        FROM "conversation" WHERE id = ${id}::uuid FOR UPDATE`;
      return rows[0] ?? null;
    },

    async participantIds(conversationId) {
      const rows = await db.conversationParticipant.findMany({
        where: { conversationId },
        select: { userId: true },
      });
      return rows.map((r) => r.userId);
    },

    async getOrCreateDirect(creatorId, otherId) {
      const key = directPairKey(creatorId, otherId);
      // The loser of a race waits on the unique index until the winner commits (participants included).
      const inserted = await db.$queryRaw<{ id: string }[]>`
        INSERT INTO "conversation" (created_by_id, is_group, direct_pair_key)
        VALUES (${creatorId}::uuid, false, ${key})
        ON CONFLICT (direct_pair_key) DO NOTHING RETURNING id`;
      const created = inserted[0];
      if (created) {
        await db.conversationParticipant.createMany({
          data: [
            { conversationId: created.id, userId: creatorId },
            { conversationId: created.id, userId: otherId },
          ],
        });
        return { id: created.id, created: true };
      }
      const existing = await db.conversation.findUniqueOrThrow({
        where: { directPairKey: key },
        select: { id: true },
      });
      return { id: existing.id, created: false };
    },

    async createGroup({ creatorId, title, memberIds }) {
      const conversation = await db.conversation.create({
        data: { createdById: creatorId, isGroup: true, title },
        select: { id: true },
      });
      await db.conversationParticipant.createMany({
        data: [creatorId, ...memberIds].map((userId) => ({
          conversationId: conversation.id,
          userId,
        })),
      });
      return conversation;
    },

    async addParticipant(conversationId, userId, lastReadSeq) {
      const { count } = await db.conversationParticipant.createMany({
        data: [{ conversationId, userId, lastReadSeq: BigInt(lastReadSeq) }],
        skipDuplicates: true,
      });
      return count === 1;
    },

    async removeParticipant(conversationId, userId) {
      const { count } = await db.conversationParticipant.deleteMany({
        where: { conversationId, userId },
      });
      return count === 1;
    },

    async findMessageByClientId(conversationId, senderId, clientMessageId) {
      const row = await db.message.findUnique({
        where: {
          conversationId_senderId_clientMessageId: {
            conversationId,
            senderId,
            clientMessageId,
          },
        },
      });
      return row ? toMessage(row) : null;
    },

    async insertMessage(input) {
      return toMessage(await db.message.create({ data: input }));
    },

    async recordSend(message) {
      await db.$executeRaw`
        UPDATE "conversation" SET last_message_seq = ${message.seq}::bigint, last_message_at = ${message.createdAt}::timestamptz
        WHERE id = ${message.conversationId}::uuid`;
      await db.$executeRaw(Prisma.sql`
        UPDATE "conversation_participant" p SET unread_count = p.unread_count + 1
        WHERE p.conversation_id = ${uuid(message.conversationId)} AND p.user_id <> ${uuid(message.senderId)}
          AND NOT ${blockedBetween(col("p.user_id"), uuid(message.senderId))}`);
    },

    async markRead(conversationId, userId, upToSeq) {
      const marker = Prisma.sql`GREATEST(p.last_read_seq, LEAST(${upToSeq}::bigint, c.last_message_seq))`;
      await db.$executeRaw(Prisma.sql`
        UPDATE "conversation_participant" p
        SET last_read_seq = ${marker}, unread_count = ${unreadCountFor(marker)}
        FROM "conversation" c
        WHERE p.conversation_id = ${uuid(conversationId)} AND p.user_id = ${uuid(userId)} AND c.id = p.conversation_id`);
    },

    async rebuildUnread(conversationId) {
      await db.$executeRaw(Prisma.sql`
        UPDATE "conversation_participant" p SET unread_count = ${unreadCountFor(Prisma.sql`p.last_read_seq`)}
        WHERE p.conversation_id = ${uuid(conversationId)}`);
    },

    async messageTarget(messageId) {
      return db.message.findUnique({
        where: { id: messageId },
        select: { conversationId: true, senderId: true },
      });
    },

    async insertReport({ reporterId, messageId, reason }) {
      const { count } = await db.report.createMany({
        data: [
          { reporterId, targetType: "MESSAGE", targetId: messageId, reason },
        ],
        skipDuplicates: true,
      });
      const row = await db.report.findUniqueOrThrow({
        where: {
          reporterId_targetType_targetId: {
            reporterId,
            targetType: "MESSAGE",
            targetId: messageId,
          },
        },
        select: { id: true },
      });
      return { id: row.id, created: count === 1 };
    },

    async enqueue(event) {
      await deps.outbox.add(db, event);
    },
  });

  return {
    transaction: (work) => deps.runner.run((db) => work(forClient(db))),
  };
}
