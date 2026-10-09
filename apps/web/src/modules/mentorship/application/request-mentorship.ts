import { PERMISSIONS } from "@nitap/database/permissions";
import { z } from "zod";

import { ConflictError, RateLimitedError } from "@/lib/errors";
import type { Actor } from "@/modules/auth";

import { decideRequest } from "../domain/mentorship";
import type { Authorize } from "./authz";
import type { MentorshipObserver, MentorshipStore } from "./mentorship-store";
import { cannotMentorSelf, refuse } from "./refusal";
import { parse } from "./validation";

/** `mentorship.create`: 10 requests an hour per member, the brake on mass asks. */
export const REQUEST_RATE = { max: 10, window: 60 * 60 } as const;

export type RateLimiter = {
  consume(
    key: string,
    rule: { max: number; window: number }
  ): Promise<{ allowed: boolean; retryAfter: number | null }>;
};

export const requestInput = z
  .object({
    message: z.string().trim().min(1).max(500),
    topic: z.string().trim().min(1).max(40).optional(),
  })
  .strict();

/**
 * A partial unique index turns a duplicate concurrent request into
 * MENTORSHIP_REQUEST_EXISTS. Capacity is advisory here; accept enforces it.
 */
export function createRequestMentorship(deps: {
  store: MentorshipStore;
  authorize: Authorize;
  rateLimiter: RateLimiter;
  observe?: MentorshipObserver;
}) {
  return async function requestMentorship(args: {
    actor: Actor | null;
    mentorId: string;
    input: unknown;
  }): Promise<{ mentorshipId: string }> {
    const caller = deps.authorize(args.actor, PERMISSIONS.MENTORSHIP_REQUEST);
    const mentorId = args.mentorId.toLowerCase();
    if (mentorId === caller.userId.toLowerCase()) throw cannotMentorSelf();
    const input = parse(requestInput, args.input);

    const verdict = await deps.rateLimiter.consume(
      `mentorship.create:${caller.userId}`,
      REQUEST_RATE
    );
    if (!verdict.allowed) throw new RateLimitedError(verdict.retryAfter ?? 60);

    const result = await deps.store.transaction(async (tx) => {
      const decision = decideRequest(
        await tx.mentorContext(mentorId, caller.userId)
      );
      if (!decision.ok) refuse(decision);

      const created = await tx.insert({
        mentorId,
        menteeId: caller.userId,
        topic: input.topic ?? null,
        message: input.message,
        requestedAt: new Date(),
      });
      if (!created) throw new ConflictError("MENTORSHIP_REQUEST_EXISTS");

      await tx.enqueue({
        type: "mentorship.requested",
        payload: {
          v: 1,
          mentorshipId: created.id,
          mentorId,
          menteeId: caller.userId,
          actorId: caller.userId,
        },
      });
      return { mentorshipId: created.id };
    });
    deps.observe?.("requested", result.mentorshipId);
    return result;
  };
}
export type RequestMentorship = ReturnType<typeof createRequestMentorship>;
