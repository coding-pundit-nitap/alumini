import { headers } from "next/headers";

import {
  logger,
  REQUEST_ID_HEADER,
  resolveRequestId,
  runWithRequestContext,
} from "@/infrastructure/observability";
import { asDependencyFailure } from "@/infrastructure/errors/dependency-failure";
import type { ActionResult } from "@/lib/action-result";
import {
  logLevelFor,
  toApiError,
  ValidationError,
  type ValidationDetail,
} from "@/lib/errors";

/**
 * Runs a Server Action's work inside the request context and turns any failure into an ActionResult
 * (TDS §10.2 rule 3), logged once at the boundary at the level of its class, like `routeHandler`.
 * The message is the catalogue's safe one; an unexpected error is always the generic message.
 *
 * Never call `redirect()` or `notFound()` inside `work`: they work by throwing and would be caught here.
 */
export async function runAction<T>(
  work: () => Promise<T>
): Promise<ActionResult<T>> {
  const requestId = resolveRequestId((await headers()).get(REQUEST_ID_HEADER));

  return runWithRequestContext(
    { requestId },
    async (): Promise<ActionResult<T>> => {
      try {
        return { ok: true, data: await work() };
      } catch (thrown) {
        const error = asDependencyFailure(thrown);
        const { body } = toApiError(error, requestId);
        logger[logLevelFor(error)]("action.failed", {
          error,
          metadata: { code: body.error.code },
        });
        const fields =
          error instanceof ValidationError && error.details
            ? Object.fromEntries(
                (error.details as ValidationDetail[]).map((d) => [
                  d.field,
                  d.message,
                ])
              )
            : undefined;
        return {
          ok: false,
          error: {
            code: body.error.code,
            message: body.error.message,
            ...(fields ? { fields } : {}),
          },
          requestId,
        };
      }
    }
  );
}
