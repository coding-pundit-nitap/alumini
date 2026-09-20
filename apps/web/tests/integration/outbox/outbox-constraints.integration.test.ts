import { afterEach, describe, expect, it } from "vitest";

import type { PrismaClient } from "@nitap/database";
import {
  createTestDatabase,
  expectConstraintViolation,
  type TestDatabase,
} from "@nitap/testing";

/**
 * Every outbox constraint, by its PostgreSQL name (Phase 1 pattern): violating it is rejected and the
 * error names exactly that constraint; in a scratch database where it is dropped, the same write
 * succeeds, which proves the first assertion is not vacuous.
 */
type Case = {
  name: string;
  violate: (prisma: PrismaClient) => Promise<unknown>;
};

const ok = { type: "email.send", payload: { v: 1 } };

const CASES: Case[] = [
  {
    name: "outbox_event_pkey",
    violate: async (prisma) => {
      const id = "11111111-1111-4111-8111-111111111111";
      await prisma.outboxEvent.create({ data: { ...ok, id } });
      return prisma.outboxEvent.create({ data: { ...ok, id } });
    },
  },
  {
    name: "ck_outbox_type",
    violate: (prisma) =>
      prisma.outboxEvent.create({ data: { ...ok, type: "" } }),
  },
  {
    name: "ck_outbox_type",
    violate: (prisma) =>
      prisma.outboxEvent.create({ data: { ...ok, type: "x".repeat(101) } }),
  },
  {
    name: "ck_outbox_payload_object",
    violate: (prisma) =>
      prisma.outboxEvent.create({ data: { ...ok, payload: [] } }),
  },
  {
    name: "ck_outbox_published_xor_failed",
    violate: (prisma) =>
      prisma.outboxEvent.create({
        data: {
          ...ok,
          publishedAt: new Date(),
          failedAt: new Date(),
          failureReason: "x",
        },
      }),
  },
  {
    name: "ck_outbox_failure_reason",
    violate: (prisma) =>
      prisma.outboxEvent.create({ data: { ...ok, failedAt: new Date() } }),
  },
  {
    name: "ck_outbox_failure_reason",
    violate: (prisma) =>
      prisma.outboxEvent.create({
        data: { ...ok, failureReason: "orphan reason" },
      }),
  },
];

describe("outbox_event constraints", () => {
  const databases: TestDatabase[] = [];
  const fresh = async () => {
    const db = await createTestDatabase();
    databases.push(db);
    return db;
  };

  afterEach(async () => {
    await Promise.all(databases.splice(0).map((db) => db.drop()));
  });

  it("has sensible defaults: a generated id, a creation time, unpublished and not failed", async () => {
    const db = await fresh();
    const row = await db.prisma.outboxEvent.create({ data: ok });
    expect(row.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(row.createdAt).toBeInstanceOf(Date);
    expect(row.publishedAt).toBeNull();
    expect(row.failedAt).toBeNull();
    expect(row.requestId).toBeNull();
  });

  it.each(
    CASES.map((c, index) => [`${c.name} (case ${index + 1})`, c] as const)
  )(
    "%s rejects the violating write, and the write succeeds once the constraint is dropped",
    async (_label, testCase) => {
      const enforced = await fresh();
      await expect(testCase.violate(enforced.prisma)).rejects.toSatisfy(
        (error: unknown) => {
          expectConstraintViolation(error, testCase.name);
          return true;
        }
      );

      const relaxed = await fresh();
      await relaxed.prisma.$executeRawUnsafe(
        `ALTER TABLE outbox_event DROP CONSTRAINT ${testCase.name}`
      );
      await expect(testCase.violate(relaxed.prisma)).resolves.toBeDefined();
    }
  );

  it("has the two partial indexes the relay and the pruner rely on", async () => {
    const db = await fresh();
    const rows = await db.prisma.$queryRaw<
      { indexname: string; indexdef: string }[]
    >`
      SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'outbox_event'`;
    const byName = new Map(rows.map((r) => [r.indexname, r.indexdef]));
    expect(byName.get("ix_outbox_unpublished")).toMatch(
      /WHERE.*published_at IS NULL.*failed_at IS NULL/s
    );
    expect(byName.get("ix_outbox_published")).toMatch(
      /WHERE.*published_at IS NOT NULL/s
    );
  });
});
