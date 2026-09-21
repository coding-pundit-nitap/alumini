import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createOutboxWriter } from "@nitap/database/outbox";
import { runSeed } from "@nitap/database/seed";
import { createTestDatabase, type TestDatabase } from "@nitap/testing";

import { createTransactionRunner } from "@/infrastructure/database/transaction-runner";
import { createPrismaMessagingStore } from "@/modules/messaging/infrastructure/prisma-messaging-store";

describe("messaging store against real PostgreSQL", () => {
  let db: TestDatabase;
  let a = "";
  let b = "";
  let c = "";

  beforeEach(async () => {
    db = await createTestDatabase();
    await runSeed(db.prisma);
    const ids = await Promise.all(
      ["one", "two", "three"].map(
        async (name) =>
          (
            await db.prisma.user.create({
              data: { name, email: `${name}@example.test` },
            })
          ).id
      )
    );
    [a, b, c] = ids as [string, string, string];
  });
  afterEach(async () => {
    await db.drop();
  });

  const store = () =>
    createPrismaMessagingStore({
      runner: createTransactionRunner(db.prisma),
      outbox: createOutboxWriter(),
    });
  const cid = (n: number) =>
    `00000000-0000-4000-8000-${n.toString().padStart(12, "0")}`;

  it("A→B and B→A racing create ONE direct conversation with two participants", async () => {
    const s = store();
    const [x, y] = await Promise.all([
      s.transaction((tx) => tx.getOrCreateDirect(a, b)),
      s.transaction((tx) => tx.getOrCreateDirect(b, a)),
    ]);
    expect(x.id).toBe(y.id);
    expect([x.created, y.created].filter(Boolean)).toHaveLength(1);
    expect(await db.prisma.conversation.count()).toBe(1);
    expect(await db.prisma.conversationParticipant.count()).toBe(2);
  });

  it("recordSend bumps unread for others only and skips a blocked pair", async () => {
    const s = store();
    const { id } = await s.transaction((tx) =>
      tx.createGroup({ creatorId: a, title: null, memberIds: [b, c] })
    );
    // c blocked b (canonical order: a_id < b_id)
    const [lo, hi] = [b, c].sort() as [string, string];
    await db.prisma.connection.create({
      data: {
        userAId: lo,
        userBId: hi,
        requestedById: lo,
        state: "BLOCKED",
        blockedById: c,
      },
    });
    await s.transaction(async (tx) => {
      await tx.lockConversation(id);
      const m = await tx.insertMessage({
        conversationId: id,
        senderId: b,
        body: "hi",
        clientMessageId: cid(1),
      });
      await tx.recordSend(m);
    });
    const rows = await db.prisma.conversationParticipant.findMany({
      where: { conversationId: id },
    });
    const unread = Object.fromEntries(
      rows.map((r) => [r.userId, r.unreadCount])
    );
    expect(unread).toEqual({ [a]: 1, [b]: 0, [c]: 0 });
    const conv = await db.prisma.conversation.findUniqueOrThrow({
      where: { id },
    });
    expect(conv.lastMessageSeq > 0n).toBe(true);
  });

  it("markRead moves the marker and recounts; rebuildUnread agrees with the counter", async () => {
    const s = store();
    const { id } = await s.transaction((tx) => tx.getOrCreateDirect(a, b));
    const seqs: string[] = [];
    for (let i = 1; i <= 3; i += 1) {
      await s.transaction(async (tx) => {
        await tx.lockConversation(id);
        const m = await tx.insertMessage({
          conversationId: id,
          senderId: a,
          body: `m${i}`,
          clientMessageId: cid(i),
        });
        await tx.recordSend(m);
        seqs.push(m.seq);
      });
    }
    const unreadOfB = () =>
      db.prisma.conversationParticipant.findUniqueOrThrow({
        where: { conversationId_userId: { conversationId: id, userId: b } },
      });
    expect((await unreadOfB()).unreadCount).toBe(3);
    await s.transaction((tx) => tx.markRead(id, b, seqs[1]!));
    expect((await unreadOfB()).unreadCount).toBe(1);
    await s.transaction((tx) => tx.rebuildUnread(id));
    expect((await unreadOfB()).unreadCount).toBe(1);
    // a marker beyond the last message is clamped, and never moves backwards
    await s.transaction((tx) => tx.markRead(id, b, "999999999"));
    expect((await unreadOfB()).unreadCount).toBe(0);
    await s.transaction((tx) => tx.markRead(id, b, "1"));
    expect((await unreadOfB()).lastReadSeq.toString()).toBe(seqs[2]);
  });

  it("insertReport is idempotent per reporter and message", async () => {
    const s = store();
    const first = await s.transaction((tx) =>
      tx.insertReport({ reporterId: b, messageId: cid(9), reason: "spam" })
    );
    const again = await s.transaction((tx) =>
      tx.insertReport({ reporterId: b, messageId: cid(9), reason: "spam" })
    );
    expect(first.created).toBe(true);
    expect(again).toEqual({ id: first.id, created: false });
  });

  it("enqueue writes message.sent to the outbox in the same transaction, and a rollback removes it", async () => {
    const s = store();
    const payload = {
      v: 1 as const,
      messageId: cid(1),
      conversationId: cid(2),
      senderId: a,
    };
    await s.transaction((tx) => tx.enqueue({ type: "message.sent", payload }));
    await expect(
      s.transaction(async (tx) => {
        await tx.enqueue({ type: "message.sent", payload });
        throw new Error("boom");
      })
    ).rejects.toThrow("boom");
    const events = await db.prisma.outboxEvent.findMany();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: "message.sent" });
  });
});
