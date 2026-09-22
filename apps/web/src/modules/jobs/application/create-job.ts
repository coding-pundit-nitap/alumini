import { PERMISSIONS } from "@nitap/database/permissions";

import { RateLimitedError } from "@/lib/errors";
import type { Actor } from "@/modules/auth";

import { decideCreate } from "../domain/job";
import type { JobStatus } from "../domain/job";
import { createJobInput } from "../domain/validation";
import type { Authorize } from "./authz";
import type { JobObserver, JobStore } from "./job-store";
import { parse } from "./validation-parse";

/** `job.create`: 10 requests an hour per member, same shape as mentorship.create (spec J-16). */
export const JOB_CREATE_RATE = { max: 10, window: 60 * 60 } as const;

export type RateLimiter = {
  consume(
    key: string,
    rule: { max: number; window: number }
  ): Promise<{ allowed: boolean; retryAfter: number | null }>;
};

/**
 * FR-JOB-001. Create and submit are one action (spec J-2): the outcome depends only on whether the actor
 * also holds `job.approve`. The row and its outbox event commit together.
 */
export function createCreateJob(deps: {
  store: JobStore;
  authorize: Authorize;
  can: (actor: Actor, permission: string) => boolean;
  rateLimiter: RateLimiter;
  observe?: JobObserver;
}) {
  return async function createJob(args: {
    actor: Actor | null;
    input: unknown;
  }): Promise<{ jobId: string; status: JobStatus }> {
    const caller = deps.authorize(args.actor, PERMISSIONS.JOB_CREATE);
    const input = parse(createJobInput, args.input);

    const verdict = await deps.rateLimiter.consume(
      `job.create:${caller.userId}`,
      JOB_CREATE_RATE
    );
    if (!verdict.allowed) throw new RateLimitedError(verdict.retryAfter ?? 60);

    const decision = decideCreate(deps.can(caller, PERMISSIONS.JOB_APPROVE));

    const result = await deps.store.transaction(async (tx) => {
      const created = await tx.insert({
        postedBy: caller.userId,
        ...input,
        status: decision.status,
      });
      const base = {
        v: 1 as const,
        jobId: created.id,
        postedBy: caller.userId,
        actorId: caller.userId,
      };
      if (decision.event === "job.published") {
        await tx.enqueue({
          type: "job.published",
          payload: { ...base, directPublish: decision.directPublish },
        });
      } else {
        await tx.enqueue({ type: decision.event, payload: base });
      }
      return created;
    });
    deps.observe?.(
      decision.directPublish ? "publish_direct" : "submitted",
      result.id
    );
    return { jobId: result.id, status: result.status };
  };
}
export type CreateJob = ReturnType<typeof createCreateJob>;
