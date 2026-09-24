// apps/web/tests/integration/messaging/read.integration.test.ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { runSeed } from "@nitap/database/seed";
import { createTestDatabase, type TestDatabase } from "@nitap/testing";

import { createCreateDirectConversation } from "@/modules/messaging/application/create-direct";
import { createCreateGroupConversation } from "@/modules/messaging/application/create-group";
import { createGetConversation } from "@/modules/messaging/application/get-conversation";
import { createListConversations } from "@/modules/messaging/application/list-conversations";
import { createListMessages } from "@/modules/messaging/application/list-messages";
import { createSendMessage } from "@/modules/messaging/application/send-message";
import { createPrismaMessagingQueries } from "@/modules/messaging/infrastructure/prisma-messaging-queries";

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

describe("reading conversations against real PostgreSQL", () => {
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

  function build() {
    const store = storeFor(db);
    const queries = createPrismaMessagingQueries(db.prisma);
    const deps = { store, authorize, rateLimiter: allowAll };
    return {
      direct: createCreateDirectConversation(deps),
      group: createCreateGroupConversation(deps),
      send: createSendMessage(deps),
      conversations: createListConversations({ queries, authorize }),
      detail: createGetConversation({ queries, authorize }),
      messages: createListMessages({ queries, authorize }),
    };
  }
  let n = 0;
  const say = (
    m: ReturnType<typeof build>,
    who: string,
    conversationId: string,
    body: string
  ) =>
    m.send({
      actor: actor(who),
      conversationId,
      input: { body, clientMessageId: cid((n += 1)) },
    });

  it("lists only conversations with messages, newest activity first, with unread counts and names", async () => {
    const m = build();
    const withRavi = (await m.direct({ actor: actor(asha), recipientId: ravi }))
      .conversationId;
    const withMeera = (
      await m.direct({ actor: actor(asha), recipientId: meera })
    ).conversationId;
    await m.direct({
      actor: actor(asha),
      recipientId: await member(db, "Empty"),
    });
    await say(m, ravi, withRavi, "one");
    await say(m, meera, withMeera, "two");
    await say(m, ravi, withRavi, "three");
    const { data } = await m.conversations({ actor: actor(asha) });
    expect(data.map((c) => c.id)).toEqual([withRavi, withMeera]);
    expect(data[0]).toMatchObject({ unreadCount: 2, isGroup: false });
    expect(data[0]!.participants.map((p) => p.fullName).sort()).toEqual([
      "Asha",
      "Ravi",
    ]);
  });

  it("pages messages newest first with no duplicates or gaps while new messages arrive", async () => {
    const m = build();
    const { conversationId } = await m.direct({
      actor: actor(asha),
      recipientId: ravi,
    });
    for (let i = 1; i <= 7; i += 1) await say(m, asha, conversationId, `m${i}`);
    const first = await m.messages({
      actor: actor(ravi),
      conversationId,
      limit: 3,
    });
    await say(m, asha, conversationId, "arrives-meanwhile");
    const second = await m.messages({
      actor: actor(ravi),
      conversationId,
      limit: 3,
      cursor: first.page.nextCursor!,
    });
    const third = await m.messages({
      actor: actor(ravi),
      conversationId,
      limit: 3,
      cursor: second.page.nextCursor!,
    });
    expect(
      [...first.data, ...second.data, ...third.data].map((x) => x.body)
    ).toEqual(["m7", "m6", "m5", "m4", "m3", "m2", "m1"]);
    expect(third.page).toMatchObject({ hasMore: false, nextCursor: null });
  });

  it("pages conversations by last activity with a cursor", async () => {
    const m = build();
    const ids: string[] = [];
    for (const other of [ravi, meera, await member(db, "Dev")]) {
      const id = (await m.direct({ actor: actor(asha), recipientId: other }))
        .conversationId;
      await say(m, other, id, "hi");
      ids.push(id);
    }
    const one = await m.conversations({ actor: actor(asha), limit: 2 });
    const two = await m.conversations({
      actor: actor(asha),
      limit: 2,
      cursor: one.page.nextCursor!,
    });
    expect([...one.data, ...two.data].map((c) => c.id)).toEqual(
      [...ids].reverse()
    );
  });

  it("hides a 1:1 from the member who was blocked, but not from the blocker, and keeps history", async () => {
    const m = build();
    const { conversationId } = await m.direct({
      actor: actor(asha),
      recipientId: ravi,
    });
    await say(m, asha, conversationId, "hello");
    await block(db, asha, ravi);
    expect((await m.conversations({ actor: actor(ravi) })).data).toEqual([]);
    expect(await code(m.detail({ actor: actor(ravi), conversationId }))).toBe(
      "NOT_FOUND"
    );
    expect(await code(m.messages({ actor: actor(ravi), conversationId }))).toBe(
      "NOT_FOUND"
    );
    expect(
      (await m.messages({ actor: actor(asha), conversationId })).data
    ).toHaveLength(1);
  });

  it("in a group, a block hides each side's messages from the other only", async () => {
    const m = build();
    const { conversationId } = await m.group({
      actor: actor(asha),
      input: { memberIds: [ravi, meera] },
    });
    await say(m, ravi, conversationId, "from ravi");
    await say(m, meera, conversationId, "from meera");
    await say(m, asha, conversationId, "from asha");
    await block(db, ravi, meera);
    const bodies = async (who: string) =>
      (await m.messages({ actor: actor(who), conversationId })).data
        .map((x) => x.body)
        .sort();
    expect(await bodies(meera)).toEqual(["from asha", "from meera"]);
    expect(await bodies(ravi)).toEqual(["from asha", "from ravi"]);
    expect(await bodies(asha)).toHaveLength(3);
  });

  it("previews the newest message each viewer may see, never a blocked sender's, and hides a hidden body", async () => {
    const m = build();
    const { conversationId } = await m.group({
      actor: actor(asha),
      input: { memberIds: [ravi, meera] },
    });
    await say(m, ravi, conversationId, "from ravi");
    const last = await say(m, meera, conversationId, "from meera");
    await block(db, ravi, meera);
    const preview = async (who: string) =>
      (await m.conversations({ actor: actor(who) })).data[0]!.lastMessage;
    expect(await preview(ravi)).toEqual({ senderId: ravi, body: "from ravi" });
    expect(await preview(asha)).toEqual({
      senderId: meera,
      body: "from meera",
    });
    expect(
      (await m.detail({ actor: actor(ravi), conversationId })).lastMessage
    ).toEqual({ senderId: ravi, body: "from ravi" });

    await db.prisma
      .$executeRaw`UPDATE "message" SET hidden_at = now() WHERE id = ${last.message.id}::uuid`;
    expect(await preview(asha)).toEqual({ senderId: meera, body: null });
  });

  it("refuses a non-participant, an invalid cursor and an unknown conversation", async () => {
    const m = build();
    const { conversationId } = await m.direct({
      actor: actor(asha),
      recipientId: ravi,
    });
    expect(
      await code(m.messages({ actor: actor(meera), conversationId }))
    ).toBe("NOT_FOUND");
    expect(await code(m.detail({ actor: actor(meera), conversationId }))).toBe(
      "NOT_FOUND"
    );
    expect(
      await code(m.messages({ actor: actor(asha), conversationId: cid(999) }))
    ).toBe("NOT_FOUND");
    expect(
      await code(
        m.messages({ actor: actor(asha), conversationId, cursor: "garbage" })
      )
    ).toBe("INVALID_CURSOR");
    expect(await code(m.conversations({ actor: null }))).toBe(
      "UNAUTHENTICATED"
    );
  });

  it("returns the marker and creator in the detail", async () => {
    const m = build();
    const { conversationId } = await m.group({
      actor: actor(asha),
      input: { title: "Crew", memberIds: [ravi, meera] },
    });
    const d = await m.detail({ actor: actor(ravi), conversationId });
    expect(d).toMatchObject({
      isGroup: true,
      title: "Crew",
      createdById: asha,
      lastReadSeq: "0",
      unreadCount: 0,
    });
    expect(d.participants).toHaveLength(3);
  });
});
