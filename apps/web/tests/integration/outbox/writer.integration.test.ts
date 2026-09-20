import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  InvalidOutboxEventError,
  createOutboxWriter,
} from "@nitap/database/outbox";
import { createTestDatabase, type TestDatabase } from "@nitap/testing";

const validEmail = {
  type: "email.send" as const,
  payload: {
    v: 1 as const,
    to: "person@example.test",
    template: "verify-email" as const,
    params: {
      verificationUrl: "https://alumni.example/verify?token=abc",
      expiresInMinutes: 60,
    },
  },
};

describe("outbox writer (real PostgreSQL)", () => {
  let db: TestDatabase;

  beforeEach(async () => {
    db = await createTestDatabase();
  });
  afterEach(async () => {
    await db.drop();
  });

  it("writes the event inside the caller's transaction, stamped with the request id", async () => {
    const writer = createOutboxWriter({ requestId: () => "req-123" });

    const { id } = await db.prisma.$transaction((tx) =>
      writer.add(tx, validEmail)
    );

    const row = await db.prisma.outboxEvent.findUniqueOrThrow({
      where: { id },
    });
    expect(row.type).toBe("email.send");
    expect(row.requestId).toBe("req-123");
    expect(row.publishedAt).toBeNull();
    expect(row.payload).toMatchObject({ v: 1, template: "verify-email" });
  });

  it("leaves no row when the surrounding transaction rolls back", async () => {
    const writer = createOutboxWriter();

    await expect(
      db.prisma.$transaction(async (tx) => {
        await writer.add(tx, validEmail);
        throw new Error("business rule failed after the event was written");
      })
    ).rejects.toThrow("business rule failed");

    expect(await db.prisma.outboxEvent.count()).toBe(0);
  });

  it("rejects an invalid payload inside the transaction, writes nothing, and does not echo the address", async () => {
    const writer = createOutboxWriter();
    const bad = {
      type: "email.send" as const,
      payload: { ...validEmail.payload, to: "not-an-email" },
    };

    const error = await db.prisma
      .$transaction((tx) => writer.add(tx, bad))
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(InvalidOutboxEventError);
    expect((error as Error).message).toContain("email.send");
    expect((error as Error).message).not.toContain("not-an-email");
    expect(await db.prisma.outboxEvent.count()).toBe(0);
  });

  it("stores a null request id when none is available", async () => {
    const writer = createOutboxWriter({ requestId: () => undefined });
    const { id } = await db.prisma.$transaction((tx) =>
      writer.add(tx, validEmail)
    );
    expect(
      (await db.prisma.outboxEvent.findUniqueOrThrow({ where: { id } }))
        .requestId
    ).toBeNull();
  });
});
