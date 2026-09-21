import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { runSeed } from "@nitap/database/seed";
import { createTestDatabase, type TestDatabase } from "@nitap/testing";

import { createCreateDirectConversation } from "@/modules/messaging/application/create-direct";
import { createCreateGroupConversation } from "@/modules/messaging/application/create-group";
import { createMarkRead } from "@/modules/messaging/application/mark-read";
import { createSendMessage } from "@/modules/messaging/application/send-message";

import {
  actor,
  allowAll,
  authorize,
  block,
  cid,
  code,
  member,
  storeFor,
} from "./support";

describe("conversations and sending against real PostgreSQL", () => {
  let db: TestDatabase;
  let asha: string;
  let ravi: string;
  let meera: string;

  beforeEach(async () => {
    db = await createTestDatabase();
    await runSeed(db.prisma);
    [asha, ravi, meera] = [
      await member(db, "Asha"),
      await member(db, "Ravi"),
      await member(db, "Meera"),
    ];
  });
  afterEach(async () => {
    await db.drop();
  });

  function build(rateLimiter = allowAll) {
    const store = storeFor(db);
    const deps = { store, authorize, rateLimiter };
    return {
      direct: createCreateDirectConversation(deps),
      group: createCreateGroupConversation(deps),
      send: createSendMessage(deps),
      read: createMarkRead({ store, authorize }),
    };
  }
  const events = () =>
    db.prisma.outboxEvent.findMany({ where: { type: "message.sent" } });

  describe("direct conversations", () => {
    it("reuses one conversation for both directions", async () => {
      const m = build();
      const first = await m.direct({ actor: actor(asha), recipientId: ravi });
      const second = await m.direct({ actor: actor(ravi), recipientId: asha });
      expect(second.conversationId).toBe(first.conversationId);
      expect([first.created, second.created]).toEqual([true, false]);
    });

    it("refuses yourself, an unknown member and an unverified one", async () => {
      const m = build();
      const pending = await member(db, "Pending", "SUSPENDED");
      expect(
        await code(m.direct({ actor: actor(asha), recipientId: asha }))
      ).toBe("CANNOT_MESSAGE_SELF");
      expect(
        await code(m.direct({ actor: actor(asha), recipientId: cid(999) }))
      ).toBe("NOT_FOUND");
      expect(
        await code(m.direct({ actor: actor(asha), recipientId: pending }))
      ).toBe("NOT_FOUND");
    });

    it("tells the blocker to unblock and tells the blocked member nothing", async () => {
      const m = build();
      await block(db, asha, ravi);
      expect(
        await code(m.direct({ actor: actor(asha), recipientId: ravi }))
      ).toBe("MESSAGE_BLOCKED");
      expect(
        await code(m.direct({ actor: actor(ravi), recipientId: asha }))
      ).toBe("NOT_FOUND");
    });

    it("requires a signed-in actor and is rate limited", async () => {
      expect(
        await code(build().direct({ actor: null, recipientId: ravi }))
      ).toBe("UNAUTHENTICATED");
      const limited = build({
        consume: async () => ({ allowed: false, retryAfter: 30 }),
      });
      expect(
        await code(limited.direct({ actor: actor(asha), recipientId: ravi }))
      ).toBe("RATE_LIMITED");
    });
  });

  describe("group conversations", () => {
    it("creates a group of the creator plus 2..19 verified, unblocked members", async () => {
      const { conversationId } = await build().group({
        actor: actor(asha),
        input: { title: "Batch of 2020", memberIds: [ravi, meera] },
      });
      const c = await db.prisma.conversation.findUniqueOrThrow({
        where: { id: conversationId },
      });
      expect(c).toMatchObject({
        isGroup: true,
        title: "Batch of 2020",
        createdById: asha,
        directPairKey: null,
      });
      expect(
        await db.prisma.conversationParticipant.count({
          where: { conversationId },
        })
      ).toBe(3);
    });

    it("refuses too few members, the creator among them, and blocked or unverified members", async () => {
      const m = build();
      const ghost = await member(db, "Ghost", "SUSPENDED");
      expect(
        await code(
          m.group({ actor: actor(asha), input: { memberIds: [ravi] } })
        )
      ).toBe("VALIDATION_FAILED");
      expect(
        await code(
          m.group({ actor: actor(asha), input: { memberIds: [ravi, asha] } })
        )
      ).toBe("VALIDATION_FAILED");
      expect(
        await code(
          m.group({ actor: actor(asha), input: { memberIds: [ravi, ghost] } })
        )
      ).toBe("PARTICIPANT_UNAVAILABLE");
      await block(db, ravi, meera);
      expect(
        await code(
          m.group({ actor: actor(asha), input: { memberIds: [ravi, meera] } })
        )
      ).toBe("PARTICIPANT_UNAVAILABLE");
    });
  });

  describe("sending", () => {
    it("persists the message and writes an ids-only message.sent event with it", async () => {
      const m = build();
      const { conversationId } = await m.direct({
        actor: actor(asha),
        recipientId: ravi,
      });
      const { message, created } = await m.send({
        actor: actor(asha),
        conversationId,
        input: { body: "  hello  ", clientMessageId: cid(1) },
      });
      expect(created).toBe(true);
      expect(message.body).toBe("hello");
      const [event] = await events();
      expect(event?.payload).toEqual({
        v: 1,
        messageId: message.id,
        conversationId,
        senderId: asha,
      });
      expect(JSON.stringify(event?.payload)).not.toContain("hello");
    });

    it("a retried send with the same client id returns the same message: one row, one event", async () => {
      const m = build();
      const { conversationId } = await m.direct({
        actor: actor(asha),
        recipientId: ravi,
      });
      const send = () =>
        m.send({
          actor: actor(asha),
          conversationId,
          input: { body: "once", clientMessageId: cid(7) },
        });
      const [x, y] = [await send(), await send()];
      expect(y.message.id).toBe(x.message.id);
      expect(y.created).toBe(false);
      expect(await db.prisma.message.count()).toBe(1);
      expect(await events()).toHaveLength(1);
    });

    it("refuses a non-participant with NOT_FOUND, and a body over 4000 characters", async () => {
      const m = build();
      const { conversationId } = await m.direct({
        actor: actor(asha),
        recipientId: ravi,
      });
      expect(
        await code(
          m.send({
            actor: actor(meera),
            conversationId,
            input: { body: "hi", clientMessageId: cid(1) },
          })
        )
      ).toBe("NOT_FOUND");
      expect(
        await code(
          m.send({
            actor: actor(asha),
            conversationId,
            input: { body: "x".repeat(4001), clientMessageId: cid(2) },
          })
        )
      ).toBe("VALIDATION_FAILED");
      expect(await db.prisma.message.count()).toBe(0);
    });

    it("stops a 1:1 both ways after a block, without deleting history", async () => {
      const m = build();
      const { conversationId } = await m.direct({
        actor: actor(asha),
        recipientId: ravi,
      });
      await m.send({
        actor: actor(asha),
        conversationId,
        input: { body: "before", clientMessageId: cid(1) },
      });
      await block(db, asha, ravi);
      expect(
        await code(
          m.send({
            actor: actor(asha),
            conversationId,
            input: { body: "x", clientMessageId: cid(2) },
          })
        )
      ).toBe("MESSAGE_BLOCKED");
      expect(
        await code(
          m.send({
            actor: actor(ravi),
            conversationId,
            input: { body: "x", clientMessageId: cid(3) },
          })
        )
      ).toBe("NOT_FOUND");
      expect(await db.prisma.message.count()).toBe(1);
    });

    it("refuses to send to a member who is no longer verified", async () => {
      const m = build();
      const { conversationId } = await m.direct({
        actor: actor(asha),
        recipientId: ravi,
      });
      await db.prisma.user.update({
        where: { id: ravi },
        data: { accountState: "SUSPENDED" },
      });
      expect(
        await code(
          m.send({
            actor: actor(asha),
            conversationId,
            input: { body: "x", clientMessageId: cid(1) },
          })
        )
      ).toBe("NOT_FOUND");
    });

    it("keeps unread counts and seq exact under concurrent sends from two members", async () => {
      const m = build();
      const { conversationId } = await m.direct({
        actor: actor(asha),
        recipientId: ravi,
      });
      await Promise.all(
        Array.from({ length: 20 }, (_, i) =>
          m.send({
            actor: actor(i % 2 ? ravi : asha),
            conversationId,
            input: { body: `m${i}`, clientMessageId: cid(100 + i) },
          })
        )
      );
      const rows = await db.prisma.conversationParticipant.findMany({
        where: { conversationId },
      });
      expect(
        Object.fromEntries(rows.map((r) => [r.userId, r.unreadCount]))
      ).toEqual({ [asha]: 10, [ravi]: 10 });
      const seqs = (
        await db.prisma.message.findMany({
          where: { conversationId },
          select: { seq: true },
        })
      ).map((r) => r.seq);
      expect(new Set(seqs).size).toBe(20);
      const conv = await db.prisma.conversation.findUniqueOrThrow({
        where: { id: conversationId },
      });
      expect(conv.lastMessageSeq).toBe(seqs.reduce((a, b) => (a > b ? a : b)));
    });

    it("is rate limited per member", async () => {
      const m = build({
        consume: async () => ({ allowed: false, retryAfter: 5 }),
      });
      expect(
        await code(
          m.send({
            actor: actor(asha),
            conversationId: cid(1),
            input: { body: "x", clientMessageId: cid(2) },
          })
        )
      ).toBe("RATE_LIMITED");
    });
  });

  describe("marking read", () => {
    it("clears the unread count up to the marker and never for someone else's conversation", async () => {
      const m = build();
      const { conversationId } = await m.direct({
        actor: actor(asha),
        recipientId: ravi,
      });
      const sent = [];
      for (let i = 1; i <= 3; i += 1) {
        sent.push(
          (
            await m.send({
              actor: actor(asha),
              conversationId,
              input: { body: `m${i}`, clientMessageId: cid(i) },
            })
          ).message
        );
      }
      await m.read({
        actor: actor(ravi),
        conversationId,
        input: { upToSeq: sent[1]!.seq },
      });
      const unread = async (userId: string) =>
        (
          await db.prisma.conversationParticipant.findUniqueOrThrow({
            where: { conversationId_userId: { conversationId, userId } },
          })
        ).unreadCount;
      expect(await unread(ravi)).toBe(1);
      expect(
        await code(
          m.read({
            actor: actor(meera),
            conversationId,
            input: { upToSeq: sent[2]!.seq },
          })
        )
      ).toBe("NOT_FOUND");
      expect(await unread(ravi)).toBe(1);
    });

    it("a read racing a send ends with a counter equal to a rebuild", async () => {
      const m = build();
      const { conversationId } = await m.direct({
        actor: actor(asha),
        recipientId: ravi,
      });
      const first = (
        await m.send({
          actor: actor(asha),
          conversationId,
          input: { body: "a", clientMessageId: cid(1) },
        })
      ).message;
      await Promise.all([
        m.read({
          actor: actor(ravi),
          conversationId,
          input: { upToSeq: first.seq },
        }),
        m.send({
          actor: actor(asha),
          conversationId,
          input: { body: "b", clientMessageId: cid(2) },
        }),
      ]);
      const before = await db.prisma.conversationParticipant.findUniqueOrThrow({
        where: { conversationId_userId: { conversationId, userId: ravi } },
      });
      await storeFor(db).transaction((tx) => tx.rebuildUnread(conversationId));
      const after = await db.prisma.conversationParticipant.findUniqueOrThrow({
        where: { conversationId_userId: { conversationId, userId: ravi } },
      });
      expect(before.unreadCount).toBe(1);
      expect(after.unreadCount).toBe(before.unreadCount);
    });
  });
});
