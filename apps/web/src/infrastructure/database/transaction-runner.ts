import { Prisma, type PrismaClient } from "@nitap/database";

import { getMetrics, logger } from "@/infrastructure/observability";
import {
  DependencyUnavailableError,
  TransactionRetryExhaustedError,
} from "@/lib/errors";

export type TransactionRunner = {
  /**
   * Opens one Prisma interactive transaction and passes `tx` to the callback (TDS §3.3). On a
   * serialization failure or deadlock it retries the WHOLE callback, never just the commit, up to
   * `maxRetries` attempts with jittered backoff (TDS §17.5).
   *
   * Because the callback can run more than once it must perform no I/O except through `tx`: no
   * email, HTTP, Redis or queue calls (TDS §17.2). Write an outbox row instead and let a worker
   * act after commit.
   */
  run: <T>(fn: (tx: Prisma.TransactionClient) => Promise<T>) => Promise<T>;
};

export type TransactionRunnerOptions = {
  /** Total attempts for serialization failures and deadlocks (TDS §17.5: 3). */
  maxRetries?: number;
  /** Prisma's cap on transaction duration (TDS §18.1: 5 s). */
  timeoutMs?: number;
  /** Prisma's cap on waiting for a pooled connection (TDS §18.1: 2 s). */
  maxWaitMs?: number;
  /** Backoff before attempt n+1 is `baseBackoffMs * 2^(n-1)` plus up to `baseBackoffMs` of jitter. */
  baseBackoffMs?: number;
};

const DEFAULTS = {
  maxRetries: 3,
  timeoutMs: 5_000,
  maxWaitMs: 2_000,
  baseBackoffMs: 50,
} as const;

function isSerializationFailureOrDeadlock(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  // Prisma's own conflict code for interactive transactions.
  if (error.code === "P2034") return true;
  // A raw query (FOR UPDATE, UPDATE … RETURNING) surfaces the PostgreSQL SQLSTATE in meta.
  if (error.code === "P2010") {
    const sqlState = (error.meta as { code?: string } | undefined)?.code;
    return sqlState === "40001" || sqlState === "40P01";
  }
  return false;
}

/** Unreachable, timed out, or the server closed the connection. */
function isConnectionFailure(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    ["P1001", "P1002", "P1008", "P1017"].includes(error.code)
  );
}

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

export function createTransactionRunner(
  prisma: PrismaClient,
  options: TransactionRunnerOptions = {}
): TransactionRunner {
  const { maxRetries, timeoutMs, maxWaitMs, baseBackoffMs } = {
    ...DEFAULTS,
    ...options,
  };

  return {
    async run<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>) {
      let lastError: unknown;

      for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
        try {
          return await prisma.$transaction(fn, {
            timeout: timeoutMs,
            maxWait: maxWaitMs,
          });
        } catch (error) {
          if (isConnectionFailure(error)) {
            getMetrics().increment("db_transaction_unavailable_total");
            throw new DependencyUnavailableError({ cause: error });
          }
          if (!isSerializationFailureOrDeadlock(error)) throw error;

          lastError = error;
          getMetrics().increment("db_transaction_retry_total");
          logger.warn("db.transaction.retry", {
            error,
            metadata: { attempt, maxRetries },
          });
          if (attempt < maxRetries) {
            await sleep(
              baseBackoffMs * 2 ** (attempt - 1) + Math.random() * baseBackoffMs
            );
          }
        }
      }

      getMetrics().increment("db_transaction_retry_exhausted_total");
      throw new TransactionRetryExhaustedError({ cause: lastError });
    },
  };
}
