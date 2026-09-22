import { PERMISSIONS } from "@nitap/database/permissions";
import type { ContentRemovedPayload, ReportResolvedPayload } from "@nitap/jobs";

import { NotFoundError } from "@/lib/errors";
import type { Actor } from "@/modules/auth";

import { decideResolve } from "../domain/moderation";
import type { Authorize } from "./authz";
import type { ModerationStore } from "./moderation-store";
import { refuse } from "./refusal";

/**
 * FR-MOD-003, spec C-8. `tx.patchReport` and `tx.softDeleteContent` run inside the SAME transaction as the
 * store's `.transaction()` call, so a mid-transaction failure leaves neither the report's status changed
 * nor the reported post/comment soft-deleted. Resolving your own report or your own content is refused
 * SELF_REVIEW_FORBIDDEN; resolving an already-terminal report is refused INVALID_STATE_TRANSITION.
 */
export function createResolveReport(deps: {
  store: ModerationStore;
  authorize: Authorize;
}) {
  return async function resolveReport(args: {
    actor: Actor | null;
    reportId: string;
  }): Promise<void> {
    const caller = deps.authorize(args.actor, PERMISSIONS.REPORT_REVIEW);
    const actorId = caller.userId.toLowerCase();

    await deps.store.transaction(async (tx) => {
      const report = await tx.findReport(args.reportId);
      if (!report) throw new NotFoundError();
      const contentAuthorId = await tx.contentAuthor(
        report.targetType,
        report.targetId
      );
      const decision = decideResolve(
        report.status,
        actorId,
        report.reporterId,
        contentAuthorId ?? "",
        "resolve"
      );
      if (!decision.ok) refuse(decision);

      await tx.patchReport(report.id, {
        status: decision.to,
        resolvedById: actorId,
      });
      await tx.softDeleteContent(report.targetType, report.targetId);

      await tx.enqueue({
        type: "report.resolved",
        payload: {
          v: 1,
          reportId: report.id,
          outcome: "resolved",
        } satisfies ReportResolvedPayload,
      });
      await tx.enqueue({
        type: "content.removed",
        payload: {
          v: 1,
          targetType: report.targetType,
          targetId: report.targetId,
          reportId: report.id,
        } satisfies ContentRemovedPayload,
      });
    });
  };
}
