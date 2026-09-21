// apps/web/tests/integration/messaging/participants.integration.test.ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { runSeed } from "@nitap/database/seed";
import { createTestDatabase, type TestDatabase } from "@nitap/testing";

import { createCreateDirectConversation } from "@/modules/messaging/application/create-direct";
import { createCreateGroupConversation } from "@/modules/messaging/application/create-group";
import {
  createAddParticipant,
  createRemoveParticipant,
} from "@/modules/messaging/application/manage-participants";
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

describe("group participants against real PostgreSQL", () => {
  let db: TestDatabase;
  let asha: string;
  let ravi: string;
  let meera: string;
  let dev: string;
  let groupId: string;

  beforeEach(async () => {
    db = await createTestDatabase();
    await runSeed(db.prisma);
    [asha, ravi, meera, dev] = [
      await member(db, "Asha"),
      await member(db, "Ravi"),
      await member(db, "Meera"),
      await member(db, "Dev"),
    ];
    groupId = (
      await build().group({
        actor: actor(asha),
        input: { memberIds: [ravi, meera] },
      })
    ).conversationId;
  });
  afterEach(async () => {
    await db.drop();
  });

  function build() {
    const store = storeFor(db);
    const deps = { store, authorize, rateLimiter: allowAll };
    return {
      group: createCreateGroupConversation(deps),
      direct: createCreateDirectConversation(deps),
      send: createSendMessage(deps),
      add: createAddParticipant({ store, authorize }),
      remove: createRemoveParticipant({ store, authorize }),
    };
  }
  const count = () =>
    db.prisma.conversationParticipant.count({
      where: { conversationId: groupId },
    });

  it("lets the creator add a verified member, and adding twice is a no-op", async () => {
    const m = build();
    expect(
      await m.add({ actor: actor(asha), conversationId: groupId, userId: dev })
    ).toEqual({ added: true });
    expect(
      await m.add({ actor: actor(asha), conversationId: groupId, userId: dev })
    ).toEqual({ added: false });
    expect(await count()).toBe(4);
  });

  it("refuses non-admins (NOT_GROUP_ADMIN), outsiders (NOT_FOUND) and 1:1 conversations (NOT_A_GROUP)", async () => {
    const m = build();
    expect(
      await code(
        m.add({ actor: actor(ravi), conversationId: groupId, userId: dev })
      )
    ).toBe("NOT_GROUP_ADMIN");
    expect(
      await code(
        m.add({ actor: actor(dev), conversationId: groupId, userId: dev })
      )
    ).toBe("NOT_FOUND");
    const { conversationId } = await m.direct({
      actor: actor(asha),
      recipientId: ravi,
    });
    expect(
      await code(m.add({ actor: actor(asha), conversationId, userId: dev }))
    ).toBe("NOT_A_GROUP");
  });

  it("refuses an unverified member and one blocked with a current participant", async () => {
    const m = build();
    const ghost = await member(db, "Ghost", "SUSPENDED");
    expect(
      await code(
        m.add({ actor: actor(asha), conversationId: groupId, userId: ghost })
      )
    ).toBe("PARTICIPANT_UNAVAILABLE");
    await block(db, meera, dev);
    expect(
      await code(
        m.add({ actor: actor(asha), conversationId: groupId, userId: dev })
      )
    ).toBe("PARTICIPANT_UNAVAILABLE");
    expect(await count()).toBe(3);
  });

  it("holds the 20-member cap exactly under 30 concurrent adds", async () => {
    const m = build();
    const users = await db.prisma.user.createManyAndReturn({
      data: Array.from({ length: 30 }, (_, i) => ({
        name: `bulk${i}`,
        email: `bulk${i}@example.test`,
        accountState: "VERIFIED" as const,
      })),
      select: { id: true },
    });
    const results = await Promise.allSettled(
      users.map((u) =>
        m.add({ actor: actor(asha), conversationId: groupId, userId: u.id })
      )
    );
    expect(await count()).toBe(20);
    const full = results.filter(
      (r) =>
        r.status === "rejected" &&
        (r.reason as { code?: string }).code === "GROUP_FULL"
    );
    expect(full.length).toBe(13);
  });

  it("lets a member leave, and a removed member can no longer see or send", async () => {
    const m = build();
    await m.remove({
      actor: actor(ravi),
      conversationId: groupId,
      userId: ravi,
    });
    expect(
      await code(
        m.send({
          actor: actor(ravi),
          conversationId: groupId,
          input: { body: "x", clientMessageId: cid(1) },
        })
      )
    ).toBe("NOT_FOUND");
    await m.remove({
      actor: actor(asha),
      conversationId: groupId,
      userId: meera,
    });
    expect(await count()).toBe(1);
  });

  it("refuses: creator leaving, a non-admin removing someone, removing a non-member, and leaving a 1:1", async () => {
    const m = build();
    expect(
      await code(
        m.remove({ actor: actor(asha), conversationId: groupId, userId: asha })
      )
    ).toBe("CREATOR_CANNOT_LEAVE");
    expect(
      await code(
        m.remove({ actor: actor(ravi), conversationId: groupId, userId: meera })
      )
    ).toBe("NOT_GROUP_ADMIN");
    expect(
      await code(
        m.remove({ actor: actor(asha), conversationId: groupId, userId: dev })
      )
    ).toBe("NOT_FOUND");
    const { conversationId } = await m.direct({
      actor: actor(asha),
      recipientId: ravi,
    });
    expect(
      await code(m.remove({ actor: actor(ravi), conversationId, userId: ravi }))
    ).toBe("NOT_A_GROUP");
  });
});
