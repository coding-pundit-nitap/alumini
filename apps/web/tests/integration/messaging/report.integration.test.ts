// apps/web/tests/integration/messaging/report.integration.test.ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { runSeed } from "@nitap/database/seed";
import { createTestDatabase, type TestDatabase } from "@nitap/testing";

import { createCreateDirectConversation } from "@/modules/messaging/application/create-direct";
import { createReportMessage } from "@/modules/messaging/application/report-message";
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

describe("reporting a message against real PostgreSQL", () => {
  let db: TestDatabase;
  let asha: string;
  let ravi: string;
  let meera: string;
  let messageId: string;

  beforeEach(async () => {
    db = await createTestDatabase();
    await runSeed(db.prisma);
    [asha, ravi, meera] = [
      await member(db, "Asha"),
      await member(db, "Ravi"),
      await member(db, "Meera"),
    ];
    const store = storeFor(db);
    const deps = { store, authorize, rateLimiter: allowAll };
    const { conversationId } = await createCreateDirectConversation(deps)({
      actor: actor(asha),
      recipientId: ravi,
    });
    messageId = (
      await createSendMessage(deps)({
        actor: actor(asha),
        conversationId,
        input: { body: "rude", clientMessageId: cid(1) },
      })
    ).message.id;
  });
  afterEach(async () => {
    await db.drop();
  });

  const report = () => createReportMessage({ store: storeFor(db), authorize });

  it("files an OPEN report for a participant, once per reporter and message", async () => {
    const first = await report()({
      actor: actor(ravi),
      messageId,
      input: { reason: "abusive" },
    });
    const again = await report()({
      actor: actor(ravi),
      messageId,
      input: { reason: "abusive again" },
    });
    expect(first.created).toBe(true);
    expect(again).toEqual({ reportId: first.reportId, created: false });
    expect(
      await db.prisma.report.findUniqueOrThrow({
        where: { id: first.reportId },
      })
    ).toMatchObject({
      status: "OPEN",
      targetType: "MESSAGE",
      targetId: messageId,
      reporterId: ravi,
    });
  });

  it("does not let an outsider learn the message exists, and rejects unknown ids and bad reasons", async () => {
    expect(
      await code(
        report()({ actor: actor(meera), messageId, input: { reason: "x" } })
      )
    ).toBe("NOT_FOUND");
    expect(
      await code(
        report()({
          actor: actor(ravi),
          messageId: cid(999),
          input: { reason: "x" },
        })
      )
    ).toBe("NOT_FOUND");
    expect(
      await code(
        report()({ actor: actor(ravi), messageId, input: { reason: "" } })
      )
    ).toBe("VALIDATION_FAILED");
    expect(
      await code(report()({ actor: null, messageId, input: { reason: "x" } }))
    ).toBe("UNAUTHENTICATED");
  });

  it("a member who blocked the sender can still report; the blocked sender cannot see it to report", async () => {
    await block(db, ravi, asha);
    expect(
      (
        await report()({
          actor: actor(ravi),
          messageId,
          input: { reason: "abusive" },
        })
      ).created
    ).toBe(true);
    expect(
      await code(
        report()({ actor: actor(asha), messageId, input: { reason: "x" } })
      )
    ).toBe("NOT_FOUND");
  });
});
