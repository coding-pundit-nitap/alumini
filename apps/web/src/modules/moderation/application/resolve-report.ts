import { PERMISSIONS } from "@nitap/database/permissions";
import type { ContentRemovedPayload, ReportResolvedPayload } from "@nitap/jobs";

import { NotFoundError } from "@/lib/errors";
import type { Actor } from "@/modules/auth";

import { decideResolve, resolveInput } from "../domain/moderation";
import type { Authorize } from "./authz";
import type {
  ModerationStore,
  ModerationTx,
  ReportRow,
} from "./moderation-store";
import { refuse } from "./refusal";
import { parse } from "./validation";

/** What resolving does to the reported thing. Exhaustive: a new target type fails to compile. */
async function applyResolution(
  tx: ModerationTx,
  report: ReportRow,
  actorId: string
) {
  const targetType = report.targetType;
  switch (targetType) {
    case "POST":
    case "COMMENT":
      await tx.softDeleteContent(targetType, report.targetId);
      await tx.audit({
        action: targetType === "POST" ? "post.removed" : "comment.removed",
        actorId,
        reportId: report.id,
        contentId: report.targetId,
      });
      await tx.enqueue({
        type: "content.removed",
        payload: {
          v: 1,
          targetType,
          targetId: report.targetId,
          reportId: report.id,
        } satisfies ContentRemovedPayload,
      });
      return;
    case "MESSAGE":
      // No content.removed: its copy says "post or comment".
      if (await tx.hideMessage(report.targetId))
        await tx.audit({
          action: "message.hidden",
          actorId,
          reportId: report.id,
          contentId: report.targetId,
        });
      return;
    case "USER":
      return; // suspension is a separate, deliberate step on /admin/users/[id]
    default: {
      const unhandled: never = targetType;
      throw new Error(`Unhandled report target: ${String(unhandled)}`);
    }
  }
}

/**
 * The status change and its side effect share one transaction. Resolving soft-deletes a post or
 * comment, hides a message, or changes nothing else for a user report.
 */
export function createResolveReport(deps: {
  store: ModerationStore;
  authorize: Authorize;
}) {
  return async function resolveReport(args: {
    actor: Actor | null;
    reportId: string;
    input: unknown;
  }): Promise<void> {
    const caller = deps.authorize(args.actor, PERMISSIONS.REPORT_REVIEW, {
      concealed: true,
    });
    // `?? {}` so a missing body reports the `reason` field, not "(body)".
    const { reason } = parse(resolveInput, args.input ?? {});
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
      await tx.audit({
        action: "report.resolved",
        actorId,
        reportId: report.id,
        targetType: report.targetType,
        targetId: report.targetId,
        reason,
      });
      await applyResolution(tx, report, actorId);
      await tx.enqueue({
        type: "report.resolved",
        payload: {
          v: 1,
          reportId: report.id,
          outcome: "resolved",
        } satisfies ReportResolvedPayload,
      });
    });
  };
}
