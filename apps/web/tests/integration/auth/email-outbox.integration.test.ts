import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  createOutboxWriter,
  InvalidOutboxEventError,
} from "@nitap/database/outbox";

import { createTransactionRunner } from "@/infrastructure/database/transaction-runner";
import { createAuthEmailSender } from "@/modules/auth/application/auth-emails";
import { createEmailOutbox } from "@/modules/auth/infrastructure/email-outbox";

import type { TestDatabase } from "../../support/test-database";
import { createTestDatabase } from "../../support/test-database";

describe("auth emails through the outbox (real PostgreSQL)", () => {
  let db: TestDatabase;
  let sender: ReturnType<typeof createAuthEmailSender>;

  beforeEach(async () => {
    db = await createTestDatabase();
    sender = createAuthEmailSender({
      outbox: createEmailOutbox({
        runner: createTransactionRunner(db.prisma),
        writer: createOutboxWriter(),
      }),
    });
  });

  afterEach(async () => {
    await db.drop();
  });

  it("commits one email.send row per message", async () => {
    await sender.verification(
      "a@x.test",
      "https://app.test/api/auth/verify-email?token=t"
    );

    const rows = await db.prisma.outboxEvent.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ type: "email.send", publishedAt: null });
    expect(rows[0]?.payload).toMatchObject({
      template: "verify-email",
      to: "a@x.test",
    });
  });

  it("rejects a malformed payload and writes nothing", async () => {
    await expect(
      sender.verification("not-an-email", "not a url")
    ).rejects.toThrow(InvalidOutboxEventError);
    expect(await db.prisma.outboxEvent.count()).toBe(0);
  });
});
