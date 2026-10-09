import { PERMISSIONS } from "@nitap/database/permissions";

import { NotFoundError } from "@/lib/errors";
import type { Actor } from "@/modules/auth";

import { CONTEXT_EACH_SIDE } from "../domain/messaging";
import type { Authorize } from "./authz";
import type { MessagingStore, ReportedMessageView } from "./messaging-store";

/**
 * `message.read_reported`: the reported message and at most CONTEXT_EACH_SIDE either side,
 * never a cursor. The audit row is written in the read's transaction, on every call: no read without its record.
 */
export function createReadReportedMessage(deps: {
  store: MessagingStore;
  authorize: Authorize;
}) {
  return async function readReportedMessage(args: {
    actor: Actor | null;
    reportId: string;
  }): Promise<ReportedMessageView> {
    const caller = deps.authorize(
      args.actor,
      PERMISSIONS.MESSAGE_READ_REPORTED,
      { concealed: true }
    );
    const actorId = caller.userId.toLowerCase();
    return deps.store.transaction(async (tx) => {
      const target = await tx.reportedMessage(args.reportId);
      if (!target) throw new NotFoundError();
      const messages = await tx.messageContext(
        target.conversationId,
        target.seq,
        CONTEXT_EACH_SIDE
      );
      await tx.audit({
        action: "message.read_reported",
        actorId,
        messageId: target.messageId,
        reportId: args.reportId,
      });
      return {
        reportId: args.reportId,
        conversationId: target.conversationId,
        messageId: target.messageId,
        messages: messages.map((m) => ({
          ...m,
          reported: m.id === target.messageId,
        })),
      };
    });
  };
}
