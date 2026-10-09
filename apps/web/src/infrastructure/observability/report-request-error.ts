import {
  REQUEST_ID_HEADER,
  captureError,
  resolveRequestId,
  runWithRequestContext,
} from "@nitap/observability";

import { logger } from "./index";

type RequestInfo = {
  path: string;
  method: string;
  headers: Record<string, string | string[] | undefined>;
};

type ErrorContext = {
  routePath: string;
  routeType: string;
};

/**
 * Reports errors Next.js catches itself (renders, Server Actions, unwrapped Route Handlers). The
 * `digest` is logged with `request_id` so the id a user sees leads to the failing request.
 */
export async function reportRequestError(
  error: unknown,
  request: RequestInfo,
  context: ErrorContext
): Promise<void> {
  const header = request.headers[REQUEST_ID_HEADER];
  const requestId = resolveRequestId(
    typeof header === "string" ? header : null
  );
  const digest =
    typeof error === "object" && error !== null && "digest" in error
      ? String(error.digest)
      : undefined;

  runWithRequestContext({ requestId }, () => {
    logger.error("http.request.unhandled_error", {
      error,
      metadata: {
        digest,
        method: request.method,
        // Pathname only: query strings can carry tokens.
        path: request.path.split("?")[0],
        routePath: context.routePath,
        routeType: context.routeType,
      },
    });
    captureError(error, {
      tags: {
        route: context.routePath,
        route_type: context.routeType,
        method: request.method,
      },
      extra: { digest },
    });
  });
}
