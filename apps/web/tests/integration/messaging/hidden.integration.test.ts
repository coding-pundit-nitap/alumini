import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { runSeed } from "@nitap/database/seed";
import { createTestDatabase, type TestDatabase } from "@nitap/testing";

import { createCreateDirectConversation } from "@/modules/messaging/application/create-direct";
import { createListMessages } from "@/modules/messaging/application/list-messages";
import { createSendMessage } from "@/modules/messaging/application/send-message";
import { createPrismaMessagingQueries } from "@/modules/messaging/infrastructure/prisma-messaging-queries";

import { actor, allowAll, authorize, cid, member, storeFor } from "./support";

describe("hidden messages read as tombstones", () => {
  let db: TestDatabase;
  let asha: string;
  let ravi: string;
  let conversationId: string;
  let ids: string[];

  beforeEach(async () => {
    db = await createTestDatabase();
    await runSeed(db.prisma);
    [asha, ravi] = [await member(db, "Asha"), await member(db, "Ravi")];
    const deps = { store: storeFor(db), authorize, rateLimiter: allowAll };
    ({ conversationId } = await createCreateDirectConversation(deps)({
      actor: actor(asha),
      recipientId: ravi,
    }));
    const send = createSendMessage(deps);
    ids = [];
    for (const [n, body] of ["one", "two", "three"].entries())
      ids.push(
        (
          await send({
            actor: actor(asha),
            conversationId,
            input: { body, clientMessageId: cid(n + 1) },
          })
        ).message.id
      );
  });
  afterEach(async () => {
    await db.drop();
  });

  it("returns the hidden message in place with no body, to both participants", async () => {
    const unreadBefore =
      await db.prisma.conversationParticipant.findUniqueOrThrow({
        where: { conversationId_userId: { conversationId, userId: ravi } },
      });
    await db.prisma
      .$executeRaw`UPDATE "message" SET hidden_at = now() WHERE id = ${ids[1]}::uuid`;

    const list = createListMessages({
      queries: createPrismaMessagingQueries(db.prisma),
      authorize,
    });
    for (const viewer of [asha, ravi]) {
      const { data } = await list({ actor: actor(viewer), conversationId });
      expect(data.map((m) => m.id)).toEqual([ids[2], ids[1], ids[0]]);
      expect(data[1]).toMatchObject({ hidden: true, body: null });
      expect(data[0]).toMatchObject({ hidden: false, body: "three" });
      expect(JSON.stringify(data)).not.toContain('"two"');
    }
    const unreadAfter =
      await db.prisma.conversationParticipant.findUniqueOrThrow({
        where: { conversationId_userId: { conversationId, userId: ravi } },
      });
    expect(unreadAfter.unreadCount).toBe(unreadBefore.unreadCount);
  });
});
