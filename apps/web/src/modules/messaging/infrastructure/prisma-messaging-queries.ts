// apps/web/src/modules/messaging/infrastructure/prisma-messaging-queries.ts
import { Prisma, type PrismaClient } from "@nitap/database";

import type {
  ConversationDetail,
  ListedConversation,
  MessagingQueries,
  Person,
} from "../application/messaging-store";
import { toListedMessage } from "../domain/messaging";
import { blockedBetween, col, uuid } from "./sql";

type ConversationRaw = {
  id: string;
  isGroup: boolean;
  title: string | null;
  createdById: string;
  lastMessageSeq: string;
  lastMessageAt: Date | null;
  unreadCount: number;
  lastReadSeq: string;
  lastSenderId: string | null;
  lastBody: string | null;
  lastHidden: boolean | null;
};

/** A 1:1 is hidden from the viewer when the OTHER member blocked them (the blocked party learns nothing). */
const hiddenFrom = (viewer: string) => Prisma.sql`(NOT c.is_group AND EXISTS (
  SELECT 1 FROM "conversation_participant" o
  WHERE o.conversation_id = c.id AND o.user_id <> ${uuid(viewer)}
    AND EXISTS (SELECT 1 FROM "connection" bc WHERE bc.state = 'BLOCKED' AND bc.blocked_by_id = o.user_id
      AND bc.user_a_id = LEAST(o.user_id, ${uuid(viewer)}) AND bc.user_b_id = GREATEST(o.user_id, ${uuid(viewer)}))))`;

/**
 * Every conversation read carries the newest message the viewer may see, under the same block filter
 * `listMessages` applies, so a preview never shows what the thread would hide.
 */
const select = (
  viewer: string
) => Prisma.sql`SELECT c.id, c.is_group AS "isGroup", c.title,
  c.created_by_id AS "createdById", c.last_message_seq::text AS "lastMessageSeq",
  c.last_message_at AS "lastMessageAt", p.unread_count AS "unreadCount", p.last_read_seq::text AS "lastReadSeq",
  lm.sender_id AS "lastSenderId", lm.body AS "lastBody", (lm.hidden_at IS NOT NULL) AS "lastHidden"
  FROM "conversation_participant" p JOIN "conversation" c ON c.id = p.conversation_id
  LEFT JOIN LATERAL (
    SELECT m.sender_id, m.body, m.hidden_at FROM "message" m
    WHERE m.conversation_id = c.id AND NOT ${blockedBetween(col('m."sender_id"'), uuid(viewer))}
    ORDER BY m.seq DESC LIMIT 1
  ) lm ON true`;

const lastMessageOf = (r: ConversationRaw) =>
  r.lastSenderId
    ? { senderId: r.lastSenderId, body: r.lastHidden ? null : r.lastBody }
    : null;

/** Reads for the inbox and the thread. Writes live in `prisma-messaging-store.ts`. */
export function createPrismaMessagingQueries(
  prisma: PrismaClient
): MessagingQueries {
  async function peopleOf(
    conversationIds: string[]
  ): Promise<Map<string, Person[]>> {
    const rows = await prisma.conversationParticipant.findMany({
      where: { conversationId: { in: conversationIds } },
      select: {
        conversationId: true,
        user: {
          select: {
            id: true,
            name: true,
            profile: { select: { fullName: true, photoUploadId: true } },
          },
        },
      },
    });
    const byConversation = new Map<string, Person[]>();
    for (const { conversationId, user } of rows) {
      const list = byConversation.get(conversationId) ?? [];
      list.push({
        id: user.id,
        fullName: user.profile?.fullName ?? user.name,
        hasPhoto: Boolean(user.profile?.photoUploadId),
      });
      byConversation.set(conversationId, list);
    }
    return byConversation;
  }

  async function visible(
    viewerId: string,
    conversationId: string
  ): Promise<ConversationRaw | null> {
    const rows = await prisma.$queryRaw<ConversationRaw[]>(Prisma.sql`
      ${select(viewerId)} WHERE p.user_id = ${uuid(viewerId)} AND c.id = ${uuid(conversationId)} AND NOT ${hiddenFrom(viewerId)}`);
    return rows[0] ?? null;
  }

  return {
    async listConversations(viewerId, { limit, before }) {
      const rows = await prisma.$queryRaw<ConversationRaw[]>(Prisma.sql`
        ${select(viewerId)}
        WHERE p.user_id = ${uuid(viewerId)} AND c.last_message_seq > 0 AND NOT ${hiddenFrom(viewerId)}
          ${before ? Prisma.sql`AND c.last_message_seq < ${before}::bigint` : Prisma.empty}
        ORDER BY c.last_message_seq DESC LIMIT ${limit}`);
      const people = await peopleOf(rows.map((r) => r.id));
      return rows.map((r): ListedConversation => ({
        id: r.id,
        isGroup: r.isGroup,
        title: r.title,
        participants: people.get(r.id) ?? [],
        unreadCount: r.unreadCount,
        lastMessageSeq: r.lastMessageSeq,
        lastMessageAt: r.lastMessageAt,
        lastMessage: lastMessageOf(r),
      }));
    },

    async getConversation(viewerId, conversationId) {
      const r = await visible(viewerId, conversationId);
      if (!r) return null;
      const people = await peopleOf([r.id]);
      return {
        id: r.id,
        isGroup: r.isGroup,
        title: r.title,
        createdById: r.createdById,
        participants: people.get(r.id) ?? [],
        unreadCount: r.unreadCount,
        lastReadSeq: r.lastReadSeq,
        lastMessageSeq: r.lastMessageSeq,
        lastMessageAt: r.lastMessageAt,
        lastMessage: lastMessageOf(r),
      } satisfies ConversationDetail;
    },

    async listMessages(viewerId, conversationId, { limit, before }) {
      if (!(await visible(viewerId, conversationId))) return null;
      // A sender is never paired with themselves (CHECK a_id < b_id), so the viewer's own messages always show.
      const rows = await prisma.$queryRaw<
        Parameters<typeof toListedMessage>[0][]
      >(Prisma.sql`
        SELECT m.id, m.seq::text AS seq, m.sender_id AS "senderId", m.body, m.created_at AS "createdAt",
          m.hidden_at AS "hiddenAt"
        FROM "message" m
        WHERE m.conversation_id = ${uuid(conversationId)}
          ${before ? Prisma.sql`AND m.seq < ${before}::bigint` : Prisma.empty}
          AND NOT ${blockedBetween(col('m."sender_id"'), uuid(viewerId))}
        ORDER BY m.seq DESC LIMIT ${limit}`);
      return rows.map(toListedMessage);
    },
  };
}
