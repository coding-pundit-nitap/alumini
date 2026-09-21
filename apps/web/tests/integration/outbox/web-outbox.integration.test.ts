import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { runWithRequestContext } from "@nitap/observability";
import { createTestDatabase, type TestDatabase } from "@nitap/testing";

import { createTransactionRunner } from "@/infrastructure/database/transaction-runner";
import { outbox } from "@/infrastructure/outbox";

const event = {
  type: "email.send" as const,
  payload: {
    v: 1 as const,
    to: "person@example.test",
    template: "existing-account" as const,
    params: {},
  },
};

describe("web outbox wiring (real PostgreSQL)", () => {
  let db: TestDatabase;
  let runner: ReturnType<typeof createTransactionRunner>;

  beforeEach(async () => {
    db = await createTestDatabase();
    runner = createTransactionRunner(db.prisma);
  });
  afterEach(async () => {
    await db.drop();
  });

  it("stamps the event with the current request's id", async () => {
    const { id } = await runWithRequestContext({ requestId: "req-web-1" }, () =>
      runner.run((tx) => outbox.add(tx, event))
    );
    expect(
      (await db.prisma.outboxEvent.findUniqueOrThrow({ where: { id } }))
        .requestId
    ).toBe("req-web-1");
  });

  it("commits the business change and its event together, or neither", async () => {
    await runner.run(async (tx) => {
      await tx.department.create({
        data: { code: "CSE", name: "Computer Science", shortName: "CSE" },
      });
      await outbox.add(tx, event);
    });
    expect(await db.prisma.department.count()).toBe(1);
    expect(await db.prisma.outboxEvent.count()).toBe(1);

    await expect(
      runner.run(async (tx) => {
        await tx.department.create({
          data: { code: "ECE", name: "Electronics", shortName: "ECE" },
        });
        await outbox.add(tx, event);
        throw new Error("a later step failed");
      })
    ).rejects.toThrow("a later step failed");

    expect(await db.prisma.department.count()).toBe(1); // ECE rolled back
    expect(await db.prisma.outboxEvent.count()).toBe(1); // and so did its event
  });
});
