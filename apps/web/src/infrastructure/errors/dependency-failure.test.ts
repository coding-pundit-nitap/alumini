import { describe, expect, it } from "vitest";

import { Prisma } from "@nitap/database";
import { StorageError } from "@nitap/storage";

import {
  ConflictError,
  DependencyUnavailableError,
  toApiError,
} from "@/lib/errors";

import {
  asDependencyFailure,
  isDatabaseUnavailable,
} from "./dependency-failure";

function known(code: string, meta?: Record<string, unknown>, message = "x") {
  return new Prisma.PrismaClientKnownRequestError(message, {
    code,
    clientVersion: "test",
    meta,
  });
}
const adapter = (cause: Record<string, unknown>) => ({
  driverAdapterError: { name: "DriverAdapterError", cause },
});

// Each case is an error shape measured against a dead or stalled PostgreSQL (spec 14 F-1) or storage (F-2).
const unavailable: Array<[string, unknown]> = [
  ["refused, model query (P1001)", known("P1001")],
  [
    "refused, $queryRaw (P2010 DatabaseNotReachable)",
    known("P2010", adapter({ kind: "DatabaseNotReachable", port: 1 })),
  ],
  ["pool timeout (P2024)", known("P2024")],
  [
    "stalled, transaction (P2028 could not start)",
    known(
      "P2028",
      {},
      "Transaction API error: Unable to start a transaction in the given time."
    ),
  ],
  ["connection reset", known("P2010", adapter({ kind: "ConnectionClosed" }))],
  [
    "statement timeout (57014)",
    known("P2010", adapter({ kind: "postgres", code: "57014" })),
  ],
  [
    "server shutting down (57P01)",
    known("P2010", adapter({ kind: "postgres", code: "57P01" })),
  ],
  [
    "stalled, model query (pg connection timeout)",
    new Error("Connection terminated due to connection timeout"),
  ],
  [
    "pg-pool acquire timeout",
    new Error("timeout exceeded when trying to connect"),
  ],
  ["client-side query timeout", new Error("Query read timeout")],
  [
    "wrapped in a cause",
    new Error("use case failed", { cause: known("P1001") }),
  ],
  ["storage unavailable", new StorageError("down", "unavailable")],
];

describe("asDependencyFailure (spec 14 RD-3)", () => {
  it.each(unavailable)(
    "%s → 503 SERVICE_UNAVAILABLE with Retry-After",
    (_name, error) => {
      const translated = asDependencyFailure(error);
      expect(translated).toBeInstanceOf(DependencyUnavailableError);
      const response = toApiError(translated, "req-1");
      expect(response.status).toBe(503);
      expect(response.body.error.code).toBe("SERVICE_UNAVAILABLE");
      expect(response.headers["Retry-After"]).toBe("5");
    }
  );

  it.each<[string, unknown]>([
    ["a unique violation", known("P2002")],
    [
      "P2028 for a transaction that already closed",
      known("P2028", {}, "Transaction already closed"),
    ],
    [
      "a constraint error from the adapter",
      known("P2010", adapter({ kind: "postgres", code: "23505" })),
    ],
    ["a storage not-found", new StorageError("gone", "not_found")],
    ["a plain bug", new TypeError("undefined is not a function")],
  ])("leaves %s alone", (_name, error) => {
    expect(asDependencyFailure(error)).toBe(error);
  });

  it("never re-wraps an AppError", () => {
    const error = new ConflictError("EVENT_FULL");
    expect(asDependencyFailure(error)).toBe(error);
  });

  it("isDatabaseUnavailable is true only for PostgreSQL failures", () => {
    expect(isDatabaseUnavailable(known("P1001"))).toBe(true);
    expect(isDatabaseUnavailable(new StorageError("down", "unavailable"))).toBe(
      false
    );
  });
});
