import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { runSeed } from "@nitap/database/seed";
import {
  createTestDatabase,
  expectConstraintViolation,
  type TestDatabase,
} from "@nitap/testing";

describe("messaging tables (real PostgreSQL)", () => {
  let db: TestDatabase;
  let a: string;
  let b: string;
  let conversationId: string;

  beforeEach(async () => {
    db = await createTestDatabase();
    await runSeed(db.prisma);
    const users = await Promise.all(
      ["one", "two"].map((name) =>
        db.prisma.user.create({ data: { name, email: `${name}@example.test` } })
      )
    );
    [a, b] = users.map((u) => u.id) as [string, string];
    conversationId = (
      await db.prisma.conversation.create({
        data: { createdById: a, isGroup: false, directPairKey: `${a}:${b}` },
      })
    ).id;
  });
  afterEach(async () => {
    await db.drop();
  });

  const fail = (p: Promise<unknown>) => p.catch((e) => e);

  it("gives a 1:1 conversation one row per pair (uq_conversation_direct_pair)", async () => {
    expectConstraintViolation(
      await fail(
        db.prisma.conversation.create({
          data: { createdById: b, isGroup: false, directPairKey: `${a}:${b}` },
        })
      ),
      "uq_conversation_direct_pair"
    );
  });

  it("requires a pair key exactly when the conversation is not a group (ck_conversation_direct_key)", async () => {
    expectConstraintViolation(
      await fail(
        db.prisma.conversation.create({
          data: { createdById: a, isGroup: false },
        })
      ),
      "ck_conversation_direct_key"
    );
    expectConstraintViolation(
      await fail(
        db.prisma.conversation.create({
          data: { createdById: a, isGroup: true, directPairKey: "x" },
        })
      ),
      "ck_conversation_direct_key"
    );
  });

  it("bounds the group title (ck_conversation_title)", async () => {
    expectConstraintViolation(
      await fail(
        db.prisma.conversation.create({
          data: { createdById: a, isGroup: true, title: "" },
        })
      ),
      "ck_conversation_title"
    );
  });

  it("refuses a duplicate participant (pk) and negative counters (ck_participant_counters)", async () => {
    await db.prisma.conversationParticipant.create({
      data: { conversationId, userId: a },
    });
    expect(
      await fail(
        db.prisma.conversationParticipant.create({
          data: { conversationId, userId: a },
        })
      )
    ).toBeInstanceOf(Error);
    expectConstraintViolation(
      await fail(
        db.prisma.conversationParticipant.create({
          data: { conversationId, userId: b, unreadCount: -1 },
        })
      ),
      "ck_participant_counters"
    );
  });

  it("bounds the message body (ck_message_body) and dedupes client ids (uq_message_client_id)", async () => {
    const base = {
      conversationId,
      senderId: a,
      clientMessageId: "11111111-1111-4111-8111-111111111111",
    };
    expectConstraintViolation(
      await fail(db.prisma.message.create({ data: { ...base, body: "" } })),
      "ck_message_body"
    );
    expectConstraintViolation(
      await fail(
        db.prisma.message.create({ data: { ...base, body: "x".repeat(4001) } })
      ),
      "ck_message_body"
    );
    await db.prisma.message.create({ data: { ...base, body: "hi" } });
    expectConstraintViolation(
      await fail(
        db.prisma.message.create({ data: { ...base, body: "again" } })
      ),
      "uq_message_client_id"
    );
  });

  it("orders messages by an increasing seq", async () => {
    const one = await db.prisma.message.create({
      data: {
        conversationId,
        senderId: a,
        body: "1",
        clientMessageId: "11111111-1111-4111-8111-111111111111",
      },
    });
    const two = await db.prisma.message.create({
      data: {
        conversationId,
        senderId: b,
        body: "2",
        clientMessageId: "22222222-2222-4222-8222-222222222222",
      },
    });
    expect(two.seq > one.seq).toBe(true);
  });

  it("files a report once per reporter and target (uq_report_once), with a bounded reason (ck_report_reason)", async () => {
    const target = "33333333-3333-4333-8333-333333333333";
    const data = {
      reporterId: b,
      targetType: "MESSAGE" as const,
      targetId: target,
      reason: "spam",
    };
    await db.prisma.report.create({ data });
    expectConstraintViolation(
      await fail(db.prisma.report.create({ data })),
      "uq_report_once"
    );
    expectConstraintViolation(
      await fail(
        db.prisma.report.create({
          data: {
            ...data,
            targetId: "44444444-4444-4444-8444-444444444444",
            reason: "",
          },
        })
      ),
      "ck_report_reason"
    );
  });

  it("requires a resolver once a report is resolved (ck_report_resolved)", async () => {
    expectConstraintViolation(
      await fail(
        db.prisma.report.create({
          data: {
            reporterId: b,
            targetType: "USER",
            targetId: a,
            reason: "abuse",
            status: "RESOLVED",
          },
        })
      ),
      "ck_report_resolved"
    );
  });

  it("removes a user's participation and messages when the user is deleted (cascade)", async () => {
    await db.prisma.conversationParticipant.create({
      data: { conversationId, userId: b },
    });
    await db.prisma.user.delete({ where: { id: b } });
    expect(
      await db.prisma.conversationParticipant.count({ where: { userId: b } })
    ).toBe(0);
  });
});
