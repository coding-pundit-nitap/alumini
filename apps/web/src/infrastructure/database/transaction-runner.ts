import { Prisma, type PrismaClient } from "@nitap/database";

import {
  DEPENDENCY_RETRY_AFTER_SECONDS,
  isDatabaseUnavailable,
} from "@/infrastructure/errors/dependency-failure";
import { getMetrics, logger } from "@/infrastructure/observability";
import {
  DependencyUnavailableError,
  TransactionRetryExhaustedError,
} from "@/lib/errors";

export type TransactionRunner = {
  /**
   * Runs the callback in an interactive transaction, retrying the whole callback on serialization
   * failures and deadlocks. It may run more than once, so do no I/O outside `tx`; use the outbox.
   */
  run: <T>(fn: (tx: Prisma.TransactionClient) => Promise<T>) => Promise<T>;
};

export type TransactionRunnerOptions = {
  /** Total attempts for serialization failures and deadlocks. */
  maxRetries?: number;
  /** Prisma's cap on transaction duration. */
  timeoutMs?: number;
  /** Prisma's cap on waiting for a pooled connection. */
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
          // Unreachable, timed out, pool exhausted, or the server closed the connection.
          if (isDatabaseUnavailable(error)) {
            getMetrics().increment("db_transaction_unavailable_total");
            throw new DependencyUnavailableError({
              cause: error,
              retryAfterSeconds: DEPENDENCY_RETRY_AFTER_SECONDS,
            });
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
