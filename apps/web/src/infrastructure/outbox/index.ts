import { createOutboxWriter } from "@nitap/database/outbox";
import type { OutboxEvent } from "@nitap/jobs";

import { getRequestContext } from "@/infrastructure/observability";

/**
 * The outbox writer for use cases (TDS §3.3): call `outbox.add(tx, event)` inside a
 * `transactionRunner.run` callback so the event commits or rolls back with the business change.
 * Web only PRODUCES events; the relay, the queue and every side effect live in the worker.
 */
export const outbox = createOutboxWriter({
  requestId: () => getRequestContext()?.requestId,
});

export type { OutboxEvent };
