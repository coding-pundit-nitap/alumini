import { PERMISSIONS } from "@nitap/database/permissions";

import { ConflictError, NotFoundError } from "@/lib/errors";
import type { Actor, Permission } from "@/modules/auth";

/** The one QueueAdmin method replay needs (structurally `QueueAdmin.retry`); the module never imports the queue package. */
export type ReplayQueue = {
  retry(queue: "email", ids: readonly string[]): Promise<number>;
};

type Authorize = (actor: Actor | null, permission: Permission) => Actor;

/**
 * Admin replay (N-13): re-queues the failed EMAIL job of one notification (its job id is the notification's dedupe
 * key). Only a FAILED email delivery qualifies, so no other queue's job can be replayed. The worker's email
 * processor rewrites the delivery row itself (SENT or FAILED) when the retried job runs. The audit row is the only
 * write in the database transaction; the BullMQ retry happens first and outside it. If the retry throws there is
 * no audit row (nothing changed that we know of). The result is counts only: job payloads hold personal data.
 */
export function createReplayNotifications(deps: {
  authorize: Authorize;
  queueAdmin: () => ReplayQueue;
  /** The dedupe key (= email job id) of the notification's EMAIL delivery if that delivery FAILED, else null. */
  failedEmailJobId: (notificationId: string) => Promise<string | null>;
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
    async replay(args: { actor: Actor | null; notificationId: string }) {
      const caller = check(args.actor);
      const jobId = await deps.failedEmailJobId(args.notificationId);
      if (!jobId) throw new NotFoundError(); // unknown and not-failed look the same
      const retried = await deps.queueAdmin().retry("email", [jobId]);
      // BullMQ already dropped the failed job (7-day retention): nothing changed, so nothing to audit.
      if (retried === 0) throw new ConflictError("REPLAY_JOB_GONE");
      await deps.audit({
        actorId: caller.userId,
        action: "notification.replay",
        targetType: "notification",
        targetId: args.notificationId,
        metadata: { retried },
      });
      return { retried };
    },
  };
}
