import { describe, expect, it, vi } from "vitest";

import { Prisma, type PrismaClient } from "@nitap/database";

import {
  DependencyUnavailableError,
  TransactionRetryExhaustedError,
} from "@/lib/errors";

import { createTransactionRunner } from "./transaction-runner";

function knownError(code: string, meta?: Record<string, unknown>) {
  return new Prisma.PrismaClientKnownRequestError("db failure", {
    code,
    clientVersion: "test",
    meta,
  });
}

/**
 * A fake whose `$transaction` runs the callback and then decides whether the COMMIT succeeds, so
 * a failed commit proves the callback body executes again on the next attempt.
 */
function fakePrisma(commitFailures: unknown[]) {
  const remaining = [...commitFailures];
  const $transaction = vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
    const result = await fn({});
    const failure = remaining.shift();
    if (failure) throw failure;
    return result;
  });
  return { prisma: { $transaction } as unknown as PrismaClient, $transaction };
}

const fast = { baseBackoffMs: 0 };

describe("TransactionRunner (TDS §17.5)", () => {
  it("returns the callback's result on success", async () => {
    const { prisma, $transaction } = fakePrisma([]);
    const runner = createTransactionRunner(prisma, fast);

    await expect(runner.run(async () => "ok")).resolves.toBe("ok");
    expect($transaction).toHaveBeenCalledTimes(1);
  });

  it("passes the transaction timeouts to Prisma", async () => {
    const { prisma, $transaction } = fakePrisma([]);
    const runner = createTransactionRunner(prisma, {
      ...fast,
      timeoutMs: 1234,
      maxWaitMs: 567,
    });

    await runner.run(async () => "ok");
    expect($transaction).toHaveBeenCalledWith(expect.any(Function), {
      timeout: 1234,
      maxWait: 567,
    });
  });

  it("re-runs the WHOLE callback after a serialization failure, then succeeds", async () => {
    const { prisma, $transaction } = fakePrisma([
      knownError("P2034"),
      knownError("P2034"),
    ]);
    const runner = createTransactionRunner(prisma, { ...fast, maxRetries: 3 });
    const callback = vi.fn(async () => "ok");

    await expect(runner.run(callback)).resolves.toBe("ok");
    expect($transaction).toHaveBeenCalledTimes(3);
    expect(callback).toHaveBeenCalledTimes(3);
  });

  it.each([
    ["serialization_failure", "40001"],
    ["deadlock_detected", "40P01"],
  ])("retries a raw-query %s (SQLSTATE %s)", async (_name, sqlState) => {
    const { prisma, $transaction } = fakePrisma([
      knownError("P2010", { code: sqlState }),
    ]);
    const runner = createTransactionRunner(prisma, fast);

    await expect(runner.run(async () => "ok")).resolves.toBe("ok");
    expect($transaction).toHaveBeenCalledTimes(2);
  });

  it("raises TransactionRetryExhaustedError, preserving the cause, when retries run out", async () => {
    const failure = knownError("P2034");
    const { prisma, $transaction } = fakePrisma([failure, failure, failure]);
    const runner = createTransactionRunner(prisma, { ...fast, maxRetries: 3 });

    const error = await runner.run(async () => "unreachable").catch((e) => e);

    expect(error).toBeInstanceOf(TransactionRetryExhaustedError);
    expect(error).not.toBeInstanceOf(DependencyUnavailableError);
    expect(error.cause).toBe(failure);
    expect($transaction).toHaveBeenCalledTimes(3);
  });

  it.each(["P1001", "P1002", "P1008", "P1017"])(
    "maps connection failure %s to DependencyUnavailableError without retrying",
    async (code) => {
      const failure = knownError(code);
      const { prisma, $transaction } = fakePrisma([failure]);
      const runner = createTransactionRunner(prisma, fast);

      const error = await runner.run(async () => "unreachable").catch((e) => e);

      expect(error).toBeInstanceOf(DependencyUnavailableError);
      expect(error.cause).toBe(failure);
      expect($transaction).toHaveBeenCalledTimes(1);
    }
  );

  it("never retries a domain error thrown by the callback", async () => {
    class DomainConflict extends Error {}
    const { prisma, $transaction } = fakePrisma([]);
    const runner = createTransactionRunner(prisma, fast);

    await expect(
      runner.run(async () => {
        throw new DomainConflict("EVENT_FULL");
      })
    ).rejects.toBeInstanceOf(DomainConflict);
    expect($transaction).toHaveBeenCalledTimes(1);
  });

  it("does not retry an unrelated database error (unique violation)", async () => {
    const { prisma, $transaction } = fakePrisma([knownError("P2002")]);
    const runner = createTransactionRunner(prisma, fast);

    await expect(runner.run(async () => "x")).rejects.toMatchObject({
      code: "P2002",
    });
    expect($transaction).toHaveBeenCalledTimes(1);
  });
});
