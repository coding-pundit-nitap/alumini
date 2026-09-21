import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  createAuditWriter,
  InvalidAuditEntryError,
} from "@nitap/database/audit";
import { createTestDatabase, type TestDatabase } from "@nitap/testing";

describe("audit writer and the append-only trigger (real PostgreSQL)", () => {
  let db: TestDatabase;
  let actorId: string;
  const targetId = "22222222-2222-4222-8222-222222222222";

  beforeEach(async () => {
    db = await createTestDatabase();
    const actor = await db.prisma.user.create({
      data: {
        name: "Ravi",
        email: "ravi@example.test",
        accountState: "VERIFIED",
      },
    });
    actorId = actor.id;
  });

  afterEach(async () => {
    await db.drop();
  });

  const entry = () => ({
    actorId,
    action: "alumni.verified",
    targetType: "user",
    targetId,
    metadata: { requestId: "r-1", crossCheck: "NOT_CHECKED" },
  });

  it("records an entry in the caller's transaction, with the request id", async () => {
    const writer = createAuditWriter({ requestId: () => "req-42" });

    await db.prisma.$transaction((tx) => writer.record(tx, entry()));

    const rows = await db.prisma.auditLog.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      actorId,
      action: "alumni.verified",
      targetType: "user",
      targetId,
      metadata: { requestId: "r-1", crossCheck: "NOT_CHECKED" },
      requestId: "req-42",
    });
  });

  it("leaves no row when the surrounding transaction rolls back", async () => {
    const writer = createAuditWriter();

    await expect(
      db.prisma.$transaction(async (tx) => {
        await writer.record(tx, entry());
        throw new Error("boom");
      })
    ).rejects.toThrow("boom");

    expect(await db.prisma.auditLog.count()).toBe(0);
  });

  it.each([
    ["an empty action", { action: "" }],
    ["an action without a namespace", { action: "verified" }],
    ["an uppercase action", { action: "Alumni.Verified" }],
    ["an action over 100 characters", { action: `a.${"b".repeat(100)}` }],
  ])("rejects %s before writing", async (_label, overrides) => {
    const writer = createAuditWriter();

    await expect(
      db.prisma.$transaction((tx) =>
        writer.record(tx, { ...entry(), ...overrides })
      )
    ).rejects.toThrow(InvalidAuditEntryError);
    expect(await db.prisma.auditLog.count()).toBe(0);
  });

  it("rejects metadata that is not a plain object", async () => {
    const writer = createAuditWriter();

    await expect(
      db.prisma.$transaction((tx) =>
        writer.record(tx, {
          ...entry(),
          metadata: [] as unknown as Record<string, unknown>,
        })
      )
    ).rejects.toThrow(InvalidAuditEntryError);
  });

  describe("the trigger", () => {
    beforeEach(async () => {
      await createAuditWriter().record(db.prisma, entry());
    });

    it.each([
      ["UPDATE", `UPDATE audit_log SET action = 'x.y'`],
      ["DELETE", `DELETE FROM audit_log`],
      ["TRUNCATE", `TRUNCATE audit_log`],
    ])("rejects %s", async (_op, sql) => {
      await expect(db.prisma.$executeRawUnsafe(sql)).rejects.toThrow(
        /append-only/
      );
      expect(await db.prisma.auditLog.count()).toBe(1);
    });

    it("still allows INSERT", async () => {
      await createAuditWriter().record(db.prisma, entry());
      expect(await db.prisma.auditLog.count()).toBe(2);
    });

    it("refuses to hard-delete a user who appears in the audit trail", async () => {
      await expect(
        db.prisma.user.delete({ where: { id: actorId } })
      ).rejects.toThrow();
    });
  });
});
