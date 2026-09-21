/**
 * Error taxonomy (TDS §16.1) and the API error envelope (API spec §1.4, catalogue §3.1).
 * Pure: no framework, no I/O. Adapters turn these into responses with `toApiError`;
 * the boundary logs once (infrastructure/http/error-response.ts).
 */

/** Safe, human-readable message and HTTP status for every code (API spec §3.1). Clients branch on `code`. */
export const ERROR_CATALOG: Record<
  string,
  { status: number; message: string }
> = {
  MALFORMED_REQUEST: {
    status: 400,
    message: "The request body is missing or is not valid JSON.",
  },
  VALIDATION_FAILED: {
    status: 400,
    message: "The request contains invalid fields.",
  },
  INVALID_CURSOR: {
    status: 400,
    message: "The pagination cursor is invalid or has expired.",
  },
  UNAUTHENTICATED: { status: 401, message: "You need to sign in." },
  PERMISSION_DENIED: {
    status: 403,
    message: "You do not have permission to do this.",
  },
  ACCOUNT_NOT_VERIFIED: {
    status: 403,
    message: "Your account has not been verified yet.",
  },
  ACCOUNT_SUSPENDED: {
    status: 403,
    message: "Your account has been suspended.",
  },
  ACCOUNT_DEACTIVATED: {
    status: 403,
    message: "Your account has been deactivated.",
  },
  ORIGIN_NOT_ALLOWED: {
    status: 403,
    message: "This request came from an origin that is not allowed.",
  },
  SELF_REVIEW_FORBIDDEN: {
    status: 403,
    message: "You cannot review your own request.",
  },
  VERIFICATION_LOCKED: {
    status: 403,
    message:
      "This account cannot submit another verification request. Please contact the alumni office.",
  },
  VERIFICATION_NOT_APPLICABLE: {
    status: 403,
    message:
      "This account is confirmed by the institute and does not submit verification evidence.",
  },
  CANNOT_CONNECT_SELF: {
    status: 400,
    message: "You cannot connect with yourself.",
  },
  NOT_CONNECTION_RECIPIENT: {
    status: 403,
    message: "Only the person who received the request can respond to it.",
  },
  NOT_FOUND: { status: 404, message: "The resource was not found." },
  METHOD_NOT_ALLOWED: {
    status: 405,
    message: "This method is not allowed for this route.",
  },
  IDEMPOTENCY_KEY_REUSED: {
    status: 409,
    message: "This idempotency key was already used with a different request.",
  },
  CONNECTION_EXISTS: {
    status: 409,
    message: "A connection or pending request already exists with this member.",
  },
  CONNECTION_COOLDOWN: {
    status: 409,
    message:
      "You cannot send this member another request yet. Please try again later.",
  },
  USER_BLOCKED: {
    status: 409,
    message: "You have blocked this member. Unblock them to connect.",
  },
  INVALID_STATE_TRANSITION: {
    status: 409,
    message: "That is no longer possible: the connection has changed.",
  },
  VERIFICATION_REQUEST_OPEN: {
    status: 409,
    message: "A verification request is already awaiting review.",
  },
  ACCOUNT_NOT_REVIEWABLE: {
    status: 409,
    message: "This account can no longer be reviewed.",
  },
  PROFILE_LIMIT_REACHED: {
    status: 409,
    message: "You have reached the limit for this section.",
  },
  PROFILE_ITEM_EXISTS: {
    status: 409,
    message: "That already exists on your profile.",
  },
  UPLOAD_TYPE_NOT_ALLOWED: {
    status: 400,
    message: "That file type is not allowed. Use a JPEG, PNG or WebP image.",
  },
  UPLOAD_TOO_LARGE: {
    status: 400,
    message: "The file is too large.",
  },
  UPLOAD_LIMIT_REACHED: {
    status: 409,
    message:
      "You have too many uploads in progress. Wait for one to finish, or remove one.",
  },
  UPLOAD_MISMATCH: {
    status: 400,
    message: "The uploaded file does not match what was declared.",
  },
  UPLOAD_NOT_READY: {
    status: 409,
    message: "This upload is not ready to be used yet.",
  },
  REQUEST_IN_PROGRESS: {
    status: 409,
    message: "A request with this idempotency key is still being processed.",
  },
  PAYLOAD_TOO_LARGE: {
    status: 413,
    message: "The request body is too large.",
  },
  UNSUPPORTED_MEDIA_TYPE: {
    status: 415,
    message: "The request must be application/json.",
  },
  RATE_LIMITED: {
    status: 429,
    message: "Too many requests. Please try again later.",
  },
  INTERNAL_ERROR: {
    status: 500,
    message: "An unexpected error occurred.",
  },
  SERVICE_UNAVAILABLE: {
    status: 503,
    message: "The service is temporarily unavailable. Please try again.",
  },
  TRANSACTION_RETRY_EXHAUSTED: {
    status: 503,
    message:
      "The operation could not complete because of a conflicting update. Please try again.",
  },
};

export type ErrorKind =
  | "validation"
  | "authentication"
  | "authorization"
  | "not_found"
  | "conflict"
  | "rate_limited"
  | "dependency_unavailable"
  | "transaction_conflict"
  | "unexpected";

/** One entry per failing field (API spec §1.5). */
export type ValidationDetail = {
  field: string;
  code: string;
  message: string;
};

type ErrorOptions = {
  /** Overrides the default code within the kind (e.g. `ACCOUNT_SUSPENDED` for an authorization error). */
  code?: string;
  /** Overrides the catalogue message. Ignored for `UnexpectedError`, which is always generic. */
  message?: string;
  details?: unknown[];
  /** The underlying error. Logged, never sent to the client. */
  cause?: unknown;
};

export abstract class AppError extends Error {
  abstract readonly kind: ErrorKind;
  readonly code: string;
  readonly details?: unknown[];

  protected constructor(
    readonly status: number,
    defaultCode: string,
    options: ErrorOptions = {}
  ) {
    const code = options.code ?? defaultCode;
    super(options.message ?? ERROR_CATALOG[code]?.message ?? code, {
      cause: options.cause,
    });
    this.name = new.target.name;
    this.code = code;
    this.details = options.details;
  }
}

export class ValidationError extends AppError {
  readonly kind = "validation";
  constructor(
    options: Omit<ErrorOptions, "details"> & {
      details?: ValidationDetail[];
    } = {}
  ) {
    super(400, "VALIDATION_FAILED", options);
  }
}

export class AuthenticationError extends AppError {
  readonly kind = "authentication";
  constructor(options: ErrorOptions = {}) {
    super(401, "UNAUTHENTICATED", options);
  }
}

export class AuthorizationError extends AppError {
  readonly kind = "authorization";
  /** `hideExistence` answers 404 so a caller cannot learn that a resource exists (API spec §3.1 `NOT_FOUND`). */
  constructor(options: ErrorOptions & { hideExistence?: boolean } = {}) {
    super(
      options.hideExistence ? 404 : 403,
      options.hideExistence ? "NOT_FOUND" : "PERMISSION_DENIED",
      options.hideExistence ? { ...options, code: "NOT_FOUND" } : options
    );
  }
}

export class NotFoundError extends AppError {
  readonly kind = "not_found";
  constructor(options: ErrorOptions = {}) {
    super(404, "NOT_FOUND", options);
  }
}

/** Duplicate, capacity, invalid transition. The code is always specific (`CONNECTION_EXISTS`, `EVENT_FULL`, …). */
export class ConflictError extends AppError {
  readonly kind = "conflict";
  constructor(code: string, options: Omit<ErrorOptions, "code"> = {}) {
    super(409, code, { ...options, code });
  }
}

export class RateLimitedError extends AppError {
  readonly kind = "rate_limited";
  constructor(
    readonly retryAfterSeconds: number,
    options: ErrorOptions = {}
  ) {
    super(429, "RATE_LIMITED", {
      details: [{ retryAfterSeconds }],
      ...options,
    });
  }
}

export class DependencyUnavailableError extends AppError {
  readonly kind = "dependency_unavailable";
  readonly retryAfterSeconds?: number;
  constructor(options: ErrorOptions & { retryAfterSeconds?: number } = {}) {
    super(503, "SERVICE_UNAVAILABLE", options);
    this.retryAfterSeconds = options.retryAfterSeconds;
  }
}

/**
 * A serialization failure or deadlock that survived TransactionRunner's bounded retry (TDS §17.5).
 * Deliberately not a DependencyUnavailableError: this is contention between concurrent requests,
 * not an unreachable dependency, and the two page differently.
 */
export class TransactionRetryExhaustedError extends AppError {
  readonly kind = "transaction_conflict";
  constructor(options: ErrorOptions = {}) {
    super(503, "TRANSACTION_RETRY_EXHAUSTED", options);
  }
}

/** A bug or unknown failure. The message is for logs; the client always gets the generic one. */
export class UnexpectedError extends AppError {
  readonly kind = "unexpected";
  constructor(message?: string, options: Omit<ErrorOptions, "message"> = {}) {
    super(500, "INTERNAL_ERROR", { ...options, message });
  }
}

export type ApiErrorBody = {
  error: { code: string; message: string; details?: unknown[] };
  requestId: string;
};

export type ApiErrorResponse = {
  status: number;
  headers: Record<string, string>;
  body: ApiErrorBody;
};

/** The one place an error becomes a status, headers and the envelope. Unknown errors become `INTERNAL_ERROR`. */
export function toApiError(
  error: unknown,
  requestId: string
): ApiErrorResponse {
  const known = error instanceof AppError && error.kind !== "unexpected";
  const appError = known ? error : new UnexpectedError();

  const headers: Record<string, string> = {};
  if (appError instanceof RateLimitedError) {
    headers["Retry-After"] = String(appError.retryAfterSeconds);
  } else if (
    appError instanceof DependencyUnavailableError &&
    appError.retryAfterSeconds !== undefined
  ) {
    headers["Retry-After"] = String(appError.retryAfterSeconds);
  } else if (appError.code === "REQUEST_IN_PROGRESS") {
    // API spec §1.6: the first request with this Idempotency-Key is still running.
    headers["Retry-After"] = "1";
  }

  return {
    status: appError.status,
    headers,
    body: {
      error: {
        code: appError.code,
        message: appError.message,
        ...(appError.details ? { details: appError.details } : {}),
      },
      requestId,
    },
  };
}

/** Client mistakes are info/warn so the error rate that pages stays meaningful (TDS §16.1). */
export function logLevelFor(error: unknown): "info" | "warn" | "error" {
  if (!(error instanceof AppError)) return "error";
  switch (error.kind) {
    case "validation":
    case "authentication":
    case "not_found":
    case "conflict":
      return "info";
    case "authorization":
    case "rate_limited":
    case "transaction_conflict":
      return "warn";
    default:
      return "error";
  }
}
