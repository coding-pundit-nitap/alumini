import { createOutboxWriter } from "@nitap/database/outbox";
import type { OutboxEvent } from "@nitap/jobs";

import { getRequestContext } from "@/infrastructure/observability";

/**
 * Call inside a `transactionRunner.run` callback so the event commits with the
 * change. The worker does the rest.
 */
export const outbox = createOutboxWriter({
  requestId: () => getRequestContext()?.requestId,
});

export type { OutboxEvent };
