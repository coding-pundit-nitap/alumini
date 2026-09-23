import { PERMISSIONS } from "@nitap/database/permissions";
import type { ReportResolvedPayload } from "@nitap/jobs";

import { NotFoundError } from "@/lib/errors";
import type { Actor } from "@/modules/auth";

import { decideResolve } from "../domain/moderation";
import type { Authorize } from "./authz";
import type { ModerationStore } from "./moderation-store";
import { refuse } from "./refusal";

/**
 * FR-MOD-004. Same shape as resolve-report, but the outcome is "dismiss": no content is touched, and only
 * `report.resolved` (outcome: "dismissed") is emitted — no `content.removed`. Dismissing your own report or
 * your own content is refused SELF_REVIEW_FORBIDDEN; dismissing an already-terminal report is refused
 * INVALID_STATE_TRANSITION.
 */
export function createDismissReport(deps: {
  store: ModerationStore;
  authorize: Authorize;
}) {
  return async function dismissReport(args: {
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
        "dismiss"
      );
      if (!decision.ok) refuse(decision);

      await tx.patchReport(report.id, {
        status: decision.to,
        resolvedById: actorId,
      });
      await tx.audit({
        action: "report.dismissed",
        actorId,
        reportId: report.id,
        targetType: report.targetType,
        targetId: report.targetId,
      });

      await tx.enqueue({
        type: "report.resolved",
        payload: {
          v: 1,
          reportId: report.id,
          outcome: "dismissed",
        } satisfies ReportResolvedPayload,
      });
    });
  };
}
