import type {
  EventLifecyclePayload,
  EventRegistrationPayload,
} from "@nitap/jobs";
import type { JobProcessor } from "@nitap/queue";

/** Acknowledges an `event.*` fact; Phase 11 replaces the body with notification fan-out. Ids only. */
export function createEventActivityProcessor(
  name: string
): JobProcessor<EventLifecyclePayload | EventRegistrationPayload> {
  return async (payload, { logger }) => {
    const ids: Record<string, unknown> = { ...payload };
    delete ids.v;
    logger.info(`event.${name}.handled`, { metadata: ids });
  };
}
