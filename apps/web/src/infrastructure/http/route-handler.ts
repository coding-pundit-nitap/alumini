import {
  REQUEST_ID_HEADER,
  captureError,
  getMetrics,
  logger,
  resolveRequestId,
  runWithRequestContext,
} from "@/infrastructure/observability";
import { asDependencyFailure } from "@/infrastructure/errors/dependency-failure";
import { logLevelFor, toApiError } from "@/lib/errors";

import { apiBudget } from "./api-budget-instance";
import { routeLabel } from "./route-label";

/**
 * Wraps a Route Handler: sets the request id, maps thrown errors to the API error envelope, logs once
 * and echoes `X-Request-Id`. Route files throw `AppError`s and never build error responses.
 */
export function routeHandler<Args extends unknown[]>(
  handler: (request: Request, ...args: Args) => Promise<Response> | Response
) {
  return async (request: Request, ...args: Args): Promise<Response> => {
    const requestId = resolveRequestId(request.headers.get(REQUEST_ID_HEADER));

    return runWithRequestContext({ requestId }, async () => {
      const started = performance.now();
      let response: Response;
      try {
        // The scope lets getActor charge the caller's API allowance once.
        response = await apiBudget.scope(async () => handler(request, ...args));
      } catch (thrown) {
        // A dead or slow PostgreSQL / object store is a 503 to retry, not a 500 bug.
        const error = asDependencyFailure(thrown);
        const { status, headers, body } = toApiError(error, requestId);
        logger[logLevelFor(error)]("http.request.failed", {
          error,
          metadata: {
            method: request.method,
            // Pathname only: query strings can carry tokens.
            path: new URL(request.url).pathname,
            status,
            code: body.error.code,
          },
        });
        response = Response.json(body, { status, headers });
        // 4xx are the client's mistakes; only server failures go to the tracker.
        if (status >= 500)
          captureError(error, {
            tags: {
              route: routeLabel(new URL(request.url).pathname, status),
              method: request.method,
            },
          });
      }

      const route = routeLabel(new URL(request.url).pathname, response.status);
      const statusClass = `${Math.floor(response.status / 100)}xx`;
      getMetrics().increment("http_requests_total", {
        method: request.method,
        status: response.status,
        route,
        status_class: statusClass,
      });
      getMetrics().observe(
        "http_request_duration_seconds",
        (performance.now() - started) / 1000,
        { method: request.method, route, status_class: statusClass }
      );
      // Responses from fetch()/redirects can have immutable headers, so copy before adding the id.
      const withId = new Response(response.body, response);
      withId.headers.set(REQUEST_ID_HEADER, requestId);
      return withId;
    });
  };
}
