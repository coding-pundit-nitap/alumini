import { PERMISSIONS } from "@nitap/database/permissions";

import { RateLimitedError } from "@/lib/errors";
import type { Actor } from "@/modules/auth";

import { makeCreateEventInput } from "../domain/validation";
import type {
  Authorize,
  EventObserver,
  EventStore,
  RateLimiter,
} from "./ports";
import { parse } from "./parse";

/** `events.create`: 10 a day per organizer. */
export const CREATE_RATE = { max: 10, window: 86400 } as const;

/** The row and its `event.created` event commit together; `observe` runs only after that commit. */
export function createCreateEvent(deps: {
  store: EventStore;
  authorize: Authorize;
  rateLimiter: RateLimiter;
  observe?: EventObserver;
  now?: () => Date;
}) {
  const now = deps.now ?? (() => new Date());
  const createEventInput = makeCreateEventInput(now);

  return async function createEvent(args: {
    actor: Actor | null;
    input: unknown;
  }): Promise<{ eventId: string }> {
    const caller = deps.authorize(args.actor, PERMISSIONS.EVENT_CREATE);
    const input = parse(createEventInput, args.input);

    const verdict = await deps.rateLimiter.consume(
      `events.create:${caller.userId}`,
      CREATE_RATE
    );
    if (!verdict.allowed) throw new RateLimitedError(verdict.retryAfter ?? 60);

    const result = await deps.store.transaction(async (tx) => {
      const created = await tx.insertEvent({
        organizerId: caller.userId,
        title: input.title,
        description: input.description,
        startsAt: input.startsAt,
        timezone: input.timezone,
        location: input.location,
        isOnline: input.isOnline,
        capacity: input.capacity,
        registrationDeadline: input.registrationDeadline,
      });
      await tx.enqueue({
        type: "event.created",
        payload: { v: 1, eventId: created.id, actorId: caller.userId },
      });
      return { eventId: created.id };
    });
    deps.observe?.("created", result.eventId);
    return result;
  };
}
export type CreateEvent = ReturnType<typeof createCreateEvent>;
