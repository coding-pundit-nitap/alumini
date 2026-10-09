import { Prisma } from "@nitap/database";
import { StorageError } from "@nitap/storage";

import { getMetrics } from "@/infrastructure/observability";
import {
  AppError,
  DependencyUnavailableError,
  ValidationError,
} from "@/lib/errors";

/** How long a client should wait before retrying a request that met an unavailable dependency. */
export const DEPENDENCY_RETRY_AFTER_SECONDS = 5;

type Dependency = "postgres" | "storage";

// Prisma's own codes for "cannot reach / timed out / connection closed / pool timeout".
const PRISMA_CONNECTION_CODES = new Set([
  "P1001",
  "P1002",
  "P1008",
  "P1017",
  "P2024",
]);
// @prisma/adapter-pg's error kinds for a dead or saturated server (its convertDriverError).
const ADAPTER_CONNECTION_KINDS = new Set([
  "DatabaseNotReachable",
  "ConnectionClosed",
  "SocketTimeout",
  "TooManyConnections",
]);
// statement_timeout, server shutting down / restarting / starting up.
const UNAVAILABLE_SQLSTATES = new Set(["57014", "57P01", "57P02", "57P03"]);
// pg and pg-pool raise plain Errors when a connection cannot be made or dies mid-query.
const PG_CONNECTION_MESSAGES = [
  "Connection terminated due to connection timeout",
  "Connection terminated unexpectedly",
  "timeout exceeded when trying to connect",
  "Query read timeout", // the pool's client-side query_timeout
];

function adapterCause(error: Prisma.PrismaClientKnownRequestError) {
  const meta = error.meta as
    | {
        driverAdapterError?: {
          cause?: { kind?: string; code?: string; originalCode?: string };
        };
      }
    | undefined;
  return meta?.driverAdapterError?.cause;
}

function databaseUnavailable(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (PRISMA_CONNECTION_CODES.has(error.code)) return true;
    // P2028 is every transaction-API error; only "could not start" means the pool could not get a connection.
    if (
      error.code === "P2028" &&
      error.message.includes("Unable to start a transaction")
    )
      return true;
    const cause = adapterCause(error);
    if (cause?.kind && ADAPTER_CONNECTION_KINDS.has(cause.kind)) return true;
    const sqlState = cause?.code ?? cause?.originalCode;
    if (
      sqlState &&
      (UNAVAILABLE_SQLSTATES.has(sqlState) || sqlState.startsWith("08"))
    )
      return true;
    return false;
  }
  if (error instanceof Prisma.PrismaClientInitializationError) return true;
  return (
    error instanceof Error &&
    PG_CONNECTION_MESSAGES.some((message) => error.message.includes(message))
  );
}

/**
 * Better Auth rethrows database failures during session reads as a bare FAILED_TO_GET_SESSION,
 * which can only mean PostgreSQL did not answer.
 */
function failedSessionLookup(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.name === "APIError" &&
    (error as { body?: { code?: unknown } }).body?.code ===
      "FAILED_TO_GET_SESSION"
  );
}

// Text PostgreSQL cannot store: a NUL byte (22021) or a character with no UTF-8 form (22P05). Only a
// client puts these in a filter or a field, so they are a 400, not a 500.
const UNSTORABLE_TEXT_SQLSTATES = new Set(["22021", "22P05"]);

function unstorableText(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  const cause = adapterCause(error);
  const sqlState = cause?.code ?? cause?.originalCode;
  return sqlState !== undefined && UNSTORABLE_TEXT_SQLSTATES.has(sqlState);
}

function classify(error: unknown): Dependency | null {
  if (failedSessionLookup(error)) return "postgres";
  // Follow `cause` a few levels: adapters and use cases sometimes wrap the driver's error.
  let current: unknown = error;
  for (let depth = 0; depth < 4 && current; depth += 1) {
    if (current instanceof StorageError)
      return current.kind === "unavailable" ? "storage" : null;
    if (databaseUnavailable(current)) return "postgres";
    current = current instanceof Error ? current.cause : undefined;
  }
  return null;
}

/** Maps PostgreSQL and storage outages to a 503, and text PostgreSQL rejects (NUL bytes) to a 400. */
export function asDependencyFailure(error: unknown): unknown {
  if (error instanceof AppError) return error;
  if (unstorableText(error))
    return new ValidationError({ code: "MALFORMED_REQUEST", cause: error });
  const dependency = classify(error);
  if (!dependency) return error;
  getMetrics().increment("dependency_unavailable_total", { dependency });
  return new DependencyUnavailableError({
    cause: error,
    retryAfterSeconds: DEPENDENCY_RETRY_AFTER_SECONDS,
  });
}

/** True when `error` means PostgreSQL could not be reached or answered in time (no metric, no wrapping). */
export function isDatabaseUnavailable(error: unknown): boolean {
  return classify(error) === "postgres";
}
