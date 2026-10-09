import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { runSeed } from "@nitap/database/seed";
import { createTestDatabase, type TestDatabase } from "@nitap/testing";

import { createCreateDirectConversation } from "@/modules/messaging/application/create-direct";
import { createReadReportedMessage } from "@/modules/messaging/application/read-reported-message";
import { createSendMessage } from "@/modules/messaging/application/send-message";

import {
  actor,
  allowAll,
  authorize,
  cid,
  code,
  member,
  storeFor,
} from "./support";

describe("readReportedMessage against real PostgreSQL", () => {
  let db: TestDatabase;
  let asha: string;
  let ravi: string;
  let meera: string;
  let moderator: string;

  beforeEach(async () => {
    db = await createTestDatabase();
    await runSeed(db.prisma);
    [asha, ravi, meera, moderator] = [
      await member(db, "Asha"),
      await member(db, "Ravi"),
      await member(db, "Meera"),
      await member(db, "Mod"),
    ];
  });
  afterEach(async () => {
    await db.drop();
  });

  const deps = () => ({
    store: storeFor(db),
    authorize,
    rateLimiter: allowAll,
  });
  let n = 0;
  async function say(from: string, conversationId: string, body: string) {
    n += 1;
    return (
      await createSendMessage(deps())({
        actor: actor(from),
        conversationId,
        input: { body, clientMessageId: cid(n) },
      })
    ).message;
  }
  const read = () =>
    createReadReportedMessage({ store: storeFor(db), authorize });

  it("returns at most 5 either side from the reported conversation only, and audits every read", async () => {
    const direct = createCreateDirectConversation(deps());
    const a = (await direct({ actor: actor(asha), recipientId: ravi }))
      .conversationId;
    const b = (await direct({ actor: actor(asha), recipientId: meera }))
      .conversationId;
    // Interleave the two conversations so the global seq alternates.
    const inA: string[] = [];
    for (let i = 0; i < 13; i += 1) {
      inA.push((await say(i % 2 ? ravi : asha, a, `a${i}`)).id);
      await say(meera, b, `b${i}`);
    }
    const target = inA[6]!;
    await db.prisma
      .$executeRaw`UPDATE "message" SET hidden_at = now() WHERE id = ${inA[5]}::uuid`;
    const report = await db.prisma.report.create({
      data: {
        reporterId: ravi,
        targetType: "MESSAGE",
        targetId: target,
        reason: "rude",
      },
    });

    const view = await read()({ actor: actor(moderator), reportId: report.id });
    expect(view.conversationId).toBe(a);
    expect(view.messages.map((m) => m.body)).toEqual([
      "a1",
      "a2",
      "a3",
      "a4",
      "a5",
      "a6",
      "a7",
      "a8",
      "a9",
      "a10",
      "a11",
    ]);
    expect(view.messages.filter((m) => m.reported).map((m) => m.id)).toEqual([
      target,
    ]);
    expect(view.messages.find((m) => m.id === inA[5])).toMatchObject({
      hidden: true,
      body: "a5",
    });
    expect(view.messages[0]!.senderName).toBe("Ravi");

    await read()({ actor: actor(moderator), reportId: report.id });
    const audit = await db.prisma.auditLog.findMany({
      where: { action: "message.read_reported" },
    });
    expect(audit).toHaveLength(2);
    expect(audit[0]).toMatchObject({
      actorId: moderator,
      targetType: "message",
      targetId: target,
      metadata: { reportId: report.id },
    });
  });

  it("is NOT_FOUND for an unknown report, a non-MESSAGE report and a message that is gone", async () => {
    const post = await db.prisma.post.create({
      data: { authorId: asha, content: "x", postType: "TEXT" },
    });
    const postReport = await db.prisma.report.create({
      data: {
        reporterId: ravi,
        targetType: "POST",
        targetId: post.id,
        reason: "x",
      },
    });
    const goneReport = await db.prisma.report.create({
      data: {
        reporterId: ravi,
        targetType: "MESSAGE",
        targetId: cid(999),
        reason: "x",
      },
    });
    for (const reportId of [cid(998), postReport.id, goneReport.id])
      expect(await code(read()({ actor: actor(moderator), reportId }))).toBe(
        "NOT_FOUND"
      );
    expect(await db.prisma.auditLog.count()).toBe(0);
  });
});
