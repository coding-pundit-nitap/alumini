import type {
  AccountStatePayload,
  VerificationDecidedPayload,
} from "@nitap/jobs";
import type { JobProcessor } from "@nitap/queue";

import type { DeliverNotification } from "../notifications/deliver.ts";

/** In-app only: the decision already sent its own email. */
export function createVerificationDecidedProcessor(deps: {
  deliver: DeliverNotification;
}): JobProcessor<VerificationDecidedPayload> {
  return async (payload, { logger, jobId: eventId }) => {
    logger.info("verification.decided.handled", {
      metadata: {
        requestId: payload.requestId,
        userId: payload.userId,
        decision: payload.decision,
      },
    });
    await deps.deliver({
      eventId,
      type: "verification.decided",
      category: "TRANSACTIONAL",
      recipientId: payload.userId,
      payload: { requestId: payload.requestId, decision: payload.decision },
    });
  };
}

/** Email only while the account is still in the announced state, so an undone suspension sends nothing. */
export function createAccountStateProcessor(
  type: "user.suspended" | "user.reactivated",
  deps: {
    deliver: DeliverNotification;
    findEmail: (
      userId: string,
      accountState: "SUSPENDED" | "VERIFIED"
    ) => Promise<string | null>;
  }
): JobProcessor<AccountStatePayload> {
  const state = type === "user.suspended" ? "SUSPENDED" : "VERIFIED";
  return async (payload, { logger, jobId: eventId }) => {
    logger.info(`${type}.handled`, {
      metadata: { userId: payload.userId, actorId: payload.actorId },
    });
    await deps.deliver({
      eventId,
      type,
      category: "TRANSACTIONAL",
      recipientId: payload.userId,
      payload: {},
      emailTo: (await deps.findEmail(payload.userId, state)) ?? undefined,
    });
  };
}
