import { PERMISSIONS } from "@nitap/database/permissions";

import type { Actor, Permission } from "@/modules/auth";

/** The one QueueAdmin method replay needs (structurally `QueueAdmin.retry`); the module never imports the queue package. */
export type ReplayQueue = {
  retry(queue: "default" | "email", ids: readonly string[]): Promise<number>;
};

type Authorize = (actor: Actor | null, permission: Permission) => Actor;

/**
 * Admin replay (N-13): re-queues failed jobs through the existing `QueueAdmin.retry`. The audit row is the only
 * write in the database transaction; the BullMQ retry happens first and outside it. If the retry throws there is
 * no audit row (nothing changed that we know of). The result is counts only: job payloads hold personal data.
 */
export function createReplayNotifications(deps: {
  authorize: Authorize;
  queueAdmin: () => ReplayQueue;
  /** Writes the entry in its own transaction (audit.record inside transactionRunner.run). */
  audit: (entry: {
    actorId: string;
    action: string;
    targetType: string;
    targetId: string;
    metadata: Record<string, unknown>;
  }) => Promise<void>;
}) {
  const check = (actor: Actor | null) =>
    deps.authorize(actor, PERMISSIONS.NOTIFICATION_REPLAY);

  return {
    /** Lets the route authenticate/authorize before it parses the body. */
    check,
    async replay(args: {
      actor: Actor | null;
      queue: "default" | "email";
      jobIds: readonly string[];
    }) {
      const caller = check(args.actor);
      const retried = await deps.queueAdmin().retry(args.queue, args.jobIds);
      await deps.audit({
        actorId: caller.userId,
        action: "notification.replay",
        // audit_log.target_id is a uuid and a queue job id is not: the row targets the operator, the jobs are in metadata.
        targetType: "notification_queue",
        targetId: caller.userId,
        metadata: {
          queue: args.queue,
          requested: args.jobIds.length,
          retried,
          jobIds: args.jobIds,
        },
      });
      return { retried };
    },
  };
}
