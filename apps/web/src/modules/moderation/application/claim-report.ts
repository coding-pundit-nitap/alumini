import { PERMISSIONS } from "@nitap/database/permissions";

import { NotFoundError } from "@/lib/errors";
import type { Actor } from "@/modules/auth";

import { decideClaim } from "../domain/moderation";
import type { Authorize } from "./authz";
import type { ModerationStore } from "./moderation-store";
import { refuse } from "./refusal";

/**
 * OPEN -> UNDER_REVIEW only; `resolvedById` is reserved for resolve/dismiss. No claiming your own
 * report or content.
 */
export function createClaimReport(deps: {
  store: ModerationStore;
  authorize: Authorize;
}) {
  return async function claimReport(args: {
    actor: Actor | null;
    reportId: string;
  }): Promise<void> {
    const caller = deps.authorize(args.actor, PERMISSIONS.REPORT_REVIEW, {
      concealed: true,
    });
    const actorId = caller.userId.toLowerCase();

    await deps.store.transaction(async (tx) => {
      const report = await tx.findReport(args.reportId);
      if (!report) throw new NotFoundError();
      const contentAuthorId = await tx.contentAuthor(
        report.targetType,
        report.targetId
      );
      const decision = decideClaim(
        report.status,
        actorId,
        report.reporterId,
        contentAuthorId ?? ""
      );
      if (!decision.ok) refuse(decision);

      await tx.patchReport(report.id, { status: "UNDER_REVIEW" });
      await tx.audit({
        action: "report.claimed",
        actorId,
        reportId: report.id,
        targetType: report.targetType,
        targetId: report.targetId,
      });
    });
  };
}
