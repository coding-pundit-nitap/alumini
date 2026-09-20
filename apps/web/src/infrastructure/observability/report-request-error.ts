import { logger } from "./index";
import { REQUEST_ID_HEADER, resolveRequestId } from "./request-id";
import { runWithRequestContext } from "./request-context";

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
 * Server-side reporting for errors Next.js catches itself: Server Component renders, Server Actions
 * and Route Handlers not wrapped in `routeHandler` (TDS §16.4 rule 6). Called from `instrumentation.ts`.
 *
 * The `digest` is what the error UI shows the user; logging it next to `request_id` is what lets
 * support go from "the id on my screen" to the failing request. The error tracker joins here in Phase 13.
 * Await everything: Next.js requires async work in `onRequestError` to be awaited.
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
  });
}
