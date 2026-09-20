import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createTransactionRunner } from "@/infrastructure/database/transaction-runner";
import { TransactionRetryExhaustedError } from "@/lib/errors";

import type { TestDatabase } from "../../support/test-database";
import { createTestDatabase } from "../../support/test-database";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("TransactionRunner against real PostgreSQL", () => {
  let db: TestDatabase;

  beforeEach(async () => {
    db = await createTestDatabase();
  });

  afterEach(async () => {
    await db.drop();
  });

  it("rolls back every write when the callback throws", async () => {
    const runner = createTransactionRunner(db.prisma);

    await expect(
      runner.run(async (tx) => {
        await tx.user.create({
          data: { name: "Rolled back", email: "rollback@example.com" },
        });
        throw new Error("boom");
      })
    ).rejects.toThrow("boom");

    expect(await db.prisma.user.count()).toBe(0);
  });

  it("commits every write from the callback on success", async () => {
    const runner = createTransactionRunner(db.prisma);

    await runner.run(async (tx) => {
      await tx.user.create({
        data: { name: "Committed", email: "committed@example.com" },
      });
      await tx.chapter.create({ data: { slug: "committed" } });
    });

    expect(await db.prisma.user.count()).toBe(1);
    expect(await db.prisma.chapter.count()).toBe(1);
  });

  /**
   * Two transactions lock two rows in opposite order. On each callback's first attempt both wait
   * until the other holds its first lock, so PostgreSQL detects a deadlock (40P01) and aborts one
   * of them. Later attempts skip the barrier and run normally.
   */
  async function deadlockingPair(maxRetries: number) {
    const a = await db.prisma.chapter.create({ data: { slug: "row-a" } });
    const b = await db.prisma.chapter.create({ data: { slug: "row-b" } });

    let holdingFirstLock = 0;
    const attempts = { one: 0, two: 0 };
    const runner = createTransactionRunner(db.prisma, {
      maxRetries,
      baseBackoffMs: 10,
      timeoutMs: 20_000,
    });

    const contend = (
      key: "one" | "two",
      first: string,
      second: string,
      name: string
    ) =>
      runner.run(async (tx) => {
        attempts[key] += 1;
        const isFirstAttempt = attempts[key] === 1;
        await tx.chapter.update({
          where: { id: first },
          data: { slug: `${name}-first-${attempts[key]}` },
        });
        if (isFirstAttempt) {
          holdingFirstLock += 1;
          while (holdingFirstLock < 2) await sleep(10);
        }
        await tx.chapter.update({
          where: { id: second },
          data: { slug: `${name}-second-${attempts[key]}` },
        });
      });

    const results = await Promise.allSettled([
      contend("one", a.id, b.id, "one"),
      contend("two", b.id, a.id, "two"),
    ]);
    return { results, attempts };
  }

  it("retries a real deadlock and both transactions eventually commit", async () => {
    const { results, attempts } = await deadlockingPair(3);

    expect(results.map((r) => r.status)).toEqual(["fulfilled", "fulfilled"]);
    // A deadlock aborted one attempt, so at least one callback ran more than once.
    expect(attempts.one + attempts.two).toBeGreaterThan(2);
  });

  it("raises TransactionRetryExhaustedError when the single allowed attempt deadlocks", async () => {
    const { results } = await deadlockingPair(1);

    const rejected = results.filter((r) => r.status === "rejected");
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(
      TransactionRetryExhaustedError
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  });
});
