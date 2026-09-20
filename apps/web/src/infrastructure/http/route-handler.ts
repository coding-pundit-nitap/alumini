import {
  REQUEST_ID_HEADER,
  getMetrics,
  logger,
  resolveRequestId,
  runWithRequestContext,
} from "@/infrastructure/observability";
import { logLevelFor, toApiError } from "@/lib/errors";

/**
 * Wraps a Route Handler with the request context and the one error translation (TDS §16.3):
 * establishes the request id, maps a thrown error to the API error envelope, logs it once at the
 * boundary at the level of its class (TDS §16.4 rule 1) and echoes `X-Request-Id` on every response.
 *
 * Route files stay adapters: parse → call use case → map. They throw `AppError`s and never build
 * error responses themselves.
 */
export function routeHandler<Args extends unknown[]>(
  handler: (request: Request, ...args: Args) => Promise<Response> | Response
) {
  return async (request: Request, ...args: Args): Promise<Response> => {
    const requestId = resolveRequestId(request.headers.get(REQUEST_ID_HEADER));

    return runWithRequestContext({ requestId }, async () => {
      let response: Response;
      try {
        response = await handler(request, ...args);
      } catch (error) {
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
      }

      getMetrics().increment("http_requests_total", {
        method: request.method,
        status: response.status,
      });
      // Responses from fetch()/redirects can have immutable headers, so copy before adding the id.
      const withId = new Response(response.body, response);
      withId.headers.set(REQUEST_ID_HEADER, requestId);
      return withId;
    });
  };
}
