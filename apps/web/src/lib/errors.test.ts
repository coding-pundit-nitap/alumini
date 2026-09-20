import { describe, it, expect } from "vitest";
import {
  AppError,
  AuthenticationError,
  AuthorizationError,
  ConflictError,
  DependencyUnavailableError,
  ERROR_CATALOG,
  NotFoundError,
  RateLimitedError,
  UnexpectedError,
  TransactionRetryExhaustedError,
  ValidationError,
  logLevelFor,
  toApiError,
} from "./errors";

describe("error taxonomy (TDS §16.1)", () => {
  it.each([
    [new ValidationError(), 400, "VALIDATION_FAILED"],
    [new AuthenticationError(), 401, "UNAUTHENTICATED"],
    [new AuthorizationError(), 403, "PERMISSION_DENIED"],
    [new NotFoundError(), 404, "NOT_FOUND"],
    [new ConflictError("CONNECTION_EXISTS"), 409, "CONNECTION_EXISTS"],
    [new RateLimitedError(30), 429, "RATE_LIMITED"],
    [new DependencyUnavailableError(), 503, "SERVICE_UNAVAILABLE"],
    [new TransactionRetryExhaustedError(), 503, "TRANSACTION_RETRY_EXHAUSTED"],
    [new UnexpectedError(), 500, "INTERNAL_ERROR"],
  ])("%o maps to %i %s", (error, status, code) => {
    expect(error).toBeInstanceOf(AppError);
    expect(error.status).toBe(status);
    expect(error.code).toBe(code);
  });

  it("answers 404 instead of 403 when existence must not leak", () => {
    const error = new AuthorizationError({ hideExistence: true });
    expect(error.status).toBe(404);
    expect(error.code).toBe("NOT_FOUND");
  });

  it("lets a per-resource code override the default within its kind", () => {
    const error = new AuthorizationError({ code: "ACCOUNT_SUSPENDED" });
    expect(error.status).toBe(403);
    expect(error.code).toBe("ACCOUNT_SUSPENDED");
  });

  it("keeps the cause for logging without exposing it", () => {
    const cause = new Error("connection refused at 10.0.0.5");
    const error = new DependencyUnavailableError({ cause });
    expect(error.cause).toBe(cause);
    expect(
      JSON.stringify(toApiError(error, "req-12345678").body)
    ).not.toContain("10.0.0.5");
  });
});

describe("TransactionRetryExhaustedError (spec D-e)", () => {
  it("is distinct from DependencyUnavailableError, keeps its cause, and logs at warn", () => {
    const cause = new Error(
      "could not serialize access due to concurrent update"
    );
    const error = new TransactionRetryExhaustedError({ cause });
    expect(error).not.toBeInstanceOf(DependencyUnavailableError);
    expect(error.kind).toBe("transaction_conflict");
    expect(error.cause).toBe(cause);
    expect(logLevelFor(error)).toBe("warn");
  });
});

describe("error catalogue (API spec §3.1)", () => {
  it("has a safe message and status for every global code", () => {
    for (const [code, entry] of Object.entries(ERROR_CATALOG)) {
      expect(code).toMatch(/^[A-Z][A-Z0-9_]+$/);
      expect(entry.message.length).toBeGreaterThan(0);
      expect(entry.status).toBeGreaterThanOrEqual(400);
      expect(entry.status).toBeLessThan(600);
    }
  });

  it("defines the default code of every error class", () => {
    const defaults = [
      new ValidationError(),
      new AuthenticationError(),
      new AuthorizationError(),
      new NotFoundError(),
      new RateLimitedError(1),
      new DependencyUnavailableError(),
      new UnexpectedError(),
    ];
    for (const error of defaults) {
      expect(ERROR_CATALOG[error.code]?.status).toBe(error.status);
    }
  });
});

describe("toApiError", () => {
  it("builds the API spec §1.4 error envelope with the request id", () => {
    const { status, body } = toApiError(
      new NotFoundError(),
      "6f1c2c3e-aaaa-bbbb-cccc-1234567890ab"
    );
    expect(status).toBe(404);
    expect(body).toEqual({
      error: { code: "NOT_FOUND", message: ERROR_CATALOG.NOT_FOUND.message },
      requestId: "6f1c2c3e-aaaa-bbbb-cccc-1234567890ab",
    });
  });

  it("includes details for validation failures", () => {
    const details = [{ field: "email", code: "INVALID_FORMAT", message: "x" }];
    const { body } = toApiError(
      new ValidationError({ details }),
      "req-12345678"
    );
    expect(body.error.details).toEqual(details);
  });

  it("sets Retry-After for rate limiting and dependency outages", () => {
    expect(toApiError(new RateLimitedError(42), "r").headers).toEqual({
      "Retry-After": "42",
    });
    expect(
      toApiError(new DependencyUnavailableError({ retryAfterSeconds: 5 }), "r")
        .headers
    ).toEqual({ "Retry-After": "5" });
  });

  it("never leaks internals of unknown errors (TDS §16.4 rule 2)", () => {
    const { status, body } = toApiError(
      new Error('relation "user" does not exist\n    at prisma.ts:12'),
      "req-12345678"
    );
    expect(status).toBe(500);
    expect(body.error.code).toBe("INTERNAL_ERROR");
    expect(JSON.stringify(body)).not.toMatch(/relation|prisma|at /);
  });

  it("does not expose the message of an UnexpectedError", () => {
    const { body } = toApiError(new UnexpectedError("secret detail"), "r");
    expect(body.error.message).toBe(ERROR_CATALOG.INTERNAL_ERROR.message);
  });
});

describe("logLevelFor (TDS §16.1)", () => {
  it.each([
    [new ValidationError(), "info"],
    [new AuthenticationError(), "info"],
    [new NotFoundError(), "info"],
    [new ConflictError("EVENT_FULL"), "info"],
    [new AuthorizationError(), "warn"],
    [new RateLimitedError(1), "warn"],
    [new DependencyUnavailableError(), "error"],
    [new UnexpectedError(), "error"],
    [new Error("boom"), "error"],
  ])("%o is logged at %s", (error, level) => {
    expect(logLevelFor(error)).toBe(level);
  });
});
