import { PERMISSIONS } from "@nitap/database/permissions";

import { NotFoundError } from "@/lib/errors";
import type { Actor } from "@/modules/auth";

import { decideClaim } from "../domain/moderation";
import type { Authorize } from "./authz";
import type { ModerationStore } from "./moderation-store";
import { refuse } from "./refusal";

/**
 * FR-MOD-002. Claim only flips status OPEN -> UNDER_REVIEW; it never sets `resolvedById` (that column is
 * reserved for the terminal outcome written by resolve/dismiss). Claiming your own report or your own
 * content is refused SELF_REVIEW_FORBIDDEN.
 */
export function createClaimReport(deps: {
  store: ModerationStore;
  authorize: Authorize;
}) {
  return async function claimReport(args: {
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
      const decision = decideClaim(
        report.status,
        actorId,
        report.reporterId,
        contentAuthorId ?? ""
      );
      if (!decision.ok) refuse(decision);

      await tx.patchReport(report.id, { status: "UNDER_REVIEW" });
    });
  };
}
