import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { runSeed } from "@nitap/database/seed";
import {
  createTestDatabase,
  expectConstraintViolation,
  type TestDatabase,
} from "@nitap/testing";

describe("connection table (real PostgreSQL)", () => {
  let db: TestDatabase;
  let a: string;
  let b: string;
  let c: string;

  beforeEach(async () => {
    db = await createTestDatabase();
    await runSeed(db.prisma);
    const users = await Promise.all(
      ["one", "two", "three"].map((name) =>
        db.prisma.user.create({ data: { name, email: `${name}@example.test` } })
      )
    );
    [a, b, c] = users.map((u) => u.id).sort() as [string, string, string];
  });
  afterEach(async () => {
    await db.drop();
  });

  const row = (over: Record<string, unknown> = {}) => ({
    userAId: a,
    userBId: b,
    requestedById: a,
    ...over,
  });
  const violation = (data: Record<string, unknown>) =>
    db.prisma.connection.create({ data: data as never }).catch((e) => e);

  it("accepts a normal pending request, stored in canonical order", async () => {
    const created = await db.prisma.connection.create({ data: row() });
    expect(created).toMatchObject({
      state: "PENDING",
      respondedAt: null,
      blockedById: null,
    });
  });

  it("prevents a duplicate pair (uq_connection_pair)", async () => {
    await db.prisma.connection.create({ data: row() });
    expectConstraintViolation(
      await violation(row({ requestedById: b })),
      "uq_connection_pair"
    );
  });

  it("prevents B→A stored as its own row: the reversed pair violates the order CHECK", async () => {
    await db.prisma.connection.create({ data: row() });
    expectConstraintViolation(
      await violation({ userAId: b, userBId: a, requestedById: b }),
      "ck_connection_order"
    );
  });

  it("prevents a self-connection (ck_connection_order)", async () => {
    expectConstraintViolation(
      await violation({ userAId: a, userBId: a, requestedById: a }),
      "ck_connection_order"
    );
  });

  it("requires the requester to be one of the pair (ck_connection_requester)", async () => {
    expectConstraintViolation(
      await violation(row({ requestedById: c })),
      "ck_connection_requester"
    );
  });

  it("records a blocker if and only if the state is BLOCKED (ck_connection_blocker)", async () => {
    expectConstraintViolation(
      await violation(row({ state: "BLOCKED" })),
      "ck_connection_blocker"
    );
    expectConstraintViolation(
      await violation(row({ state: "PENDING", blockedById: a })),
      "ck_connection_blocker"
    );
    expectConstraintViolation(
      await violation(
        row({ state: "BLOCKED", blockedById: c, respondedAt: new Date() })
      ),
      "ck_connection_blocker"
    );
    await db.prisma.connection.create({
      data: row({ state: "BLOCKED", blockedById: b, respondedAt: new Date() }),
    });
  });

  it("requires responded_at on ACCEPTED and REJECTED rows: the cooldown is computed from it (ck_connection_responded)", async () => {
    expectConstraintViolation(
      await violation(row({ state: "REJECTED" })),
      "ck_connection_responded"
    );
    expectConstraintViolation(
      await violation(row({ state: "ACCEPTED" })),
      "ck_connection_responded"
    );
  });

  it("deletes a member's connections with the member", async () => {
    await db.prisma.connection.create({ data: row() });
    await db.prisma.user.delete({ where: { id: b } });
    expect(await db.prisma.connection.count()).toBe(0);
  });
});
