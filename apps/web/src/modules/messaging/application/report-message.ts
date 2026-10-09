import { PERMISSIONS } from "@nitap/database/permissions";

import { NotFoundError } from "@/lib/errors";
import type { Actor } from "@/modules/auth";

import { reportInput } from "../domain/messaging";
import { requireParticipant } from "./access";
import type { Authorize } from "./authz";
import type { MessagingObserver, MessagingStore } from "./messaging-store";
import { parse } from "./validation";

/**
 * Only members who can see the conversation may report; anyone else gets
 * NOT_FOUND. Idempotent per reporter and message.
 */
export function createReportMessage(deps: {
  store: MessagingStore;
  authorize: Authorize;
  observe?: MessagingObserver;
}) {
  return async function reportMessage(args: {
    actor: Actor | null;
    messageId: string;
    input: unknown;
  }): Promise<{ reportId: string; created: boolean }> {
    const caller = deps.authorize(args.actor, PERMISSIONS.REPORT_CREATE);
    const input = parse(reportInput, args.input);
    const reporterId = caller.userId.toLowerCase();

    const result = await deps.store.transaction(async (tx) => {
      const target = await tx.messageTarget(args.messageId.toLowerCase());
      if (!target) throw new NotFoundError();
      await requireParticipant(tx, target.conversationId, reporterId);
      return tx.insertReport({
        reporterId,
        messageId: args.messageId.toLowerCase(),
        reason: input.reason,
      });
    });
    if (result.created) deps.observe?.("reported", result.id);
    return { reportId: result.id, created: result.created };
  };
}
