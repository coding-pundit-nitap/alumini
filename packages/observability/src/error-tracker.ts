import {
  captureException,
  close,
  dedupeIntegration,
  flush,
  initWithoutDefaultIntegrations,
  isInitialized,
  linkedErrorsIntegration,
} from "@sentry/node";
import type { ErrorEvent, NodeOptions } from "@sentry/node";

import { redact } from "./redact.ts";
import { getRequestContext } from "./request-context.ts";

/** Sentry-protocol SDK, so it works with Sentry or GlitchTip. A no-op without a DSN. */
export type ErrorTrackerOptions = {
  dsn?: string;
  environment: string;
  release: string;
  service: "web" | "worker";
  /** Tests only: replaces the HTTP transport. */
  transport?: NodeOptions["transport"];
};

export type CaptureContext = {
  tags?: Record<string, string | number | undefined>;
  extra?: Record<string, unknown>;
};

/** Returns whether the tracker is now on. */
export function initErrorTracker(options: ErrorTrackerOptions): boolean {
  if (!options.dsn) return false;
  if (isInitialized()) return true;
  initWithoutDefaultIntegrations({
    dsn: options.dsn,
    environment: options.environment,
    release: options.release,
    // Explicit capture only, cause chains kept, no tracing; the SDK collects no request data itself.
    integrations: [linkedErrorsIntegration(), dedupeIntegration()],
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
    },
    initialScope: { tags: { service: options.service } },
    beforeSend: (event) => scrubEvent(event),
    ...(options.transport ? { transport: options.transport } : {}),
  });
  return true;
}

/** Reports a server error with the current request id and user id. Never throws into the caller. */
export function captureError(
  error: unknown,
  context: CaptureContext = {}
): void {
  if (!isInitialized()) return;
  try {
    const request = getRequestContext();
    const tags: Record<string, string | number> = {};
    for (const [key, value] of Object.entries({
      request_id: request?.requestId,
      ...context.tags,
    }))
      if (value !== undefined) tags[key] = value;
    captureException(error, {
      tags,
      extra: context.extra,
      user: request?.userId ? { id: request.userId } : undefined,
    });
  } catch {
    // Reporting must never break the request or job it describes.
  }
}

/** Waits for queued events to be sent; call before the process exits. */
export async function flushErrorTracker(timeoutMs = 2_000): Promise<boolean> {
  return isInitialized() ? flush(timeoutMs) : true;
}

/** Tests only: turns the tracker off again. */
export async function closeErrorTracker(): Promise<void> {
  await close(0);
}

/** Applies log redaction to request data. Keep personal data out of error messages. */
export function scrubEvent(event: ErrorEvent): ErrorEvent {
  const scrubbed: ErrorEvent = { ...event };
  if (event.request) {
    const request = { ...event.request };
    delete request.cookies;
    delete request.query_string;
    scrubbed.request = redact({
      ...request,
      ...(request.url ? { url: request.url.split("?")[0] } : {}),
    }) as ErrorEvent["request"];
  }
  if (event.user) scrubbed.user = event.user.id ? { id: event.user.id } : {};
  if (event.extra) scrubbed.extra = redact(event.extra) as ErrorEvent["extra"];
  if (event.contexts)
    scrubbed.contexts = redact(event.contexts) as ErrorEvent["contexts"];
  if (event.tags) scrubbed.tags = redact(event.tags) as ErrorEvent["tags"];
  if (event.breadcrumbs)
    scrubbed.breadcrumbs = redact(
      event.breadcrumbs
    ) as ErrorEvent["breadcrumbs"];
  if (event.exception?.values) {
    scrubbed.exception = {
      ...event.exception,
      values: event.exception.values.map((value) =>
        value.mechanism?.data
          ? {
              ...value,
              mechanism: {
                ...value.mechanism,
                data: redact(value.mechanism.data) as Record<
                  string,
                  string | boolean
                >,
              },
            }
          : value
      ),
    };
  }
  return scrubbed;
}
