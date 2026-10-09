import { PERMISSIONS } from "@nitap/database/permissions";

import { NotFoundError } from "@/lib/errors";
import type { Actor } from "@/modules/auth";

import { isSelf } from "../domain/moderation";
import type { Authorize } from "./authz";
import type { ModerationStore, ReportView } from "./moderation-store";

/**
 * One report for its page. `selfReview` mirrors decideClaim/decideResolve's
 * guard, for the UI.
 */
export function createGetReport(deps: {
  store: ModerationStore;
  authorize: Authorize;
}) {
  return async function getReport(args: {
    actor: Actor | null;
    reportId: string;
  }): Promise<{ report: ReportView; selfReview: boolean }> {
    const caller = deps.authorize(args.actor, PERMISSIONS.REPORT_REVIEW, {
      concealed: true,
    });
    const [report] = await deps.store.transaction((tx) =>
      tx.listReports({
        reportId: args.reportId,
        statuses: [],
        after: null,
        take: 1,
      })
    );
    if (!report) throw new NotFoundError();
    const me = caller.userId.toLowerCase();
    return {
      report,
      selfReview: isSelf(me, report.reporter.id, report.targetOwnerId ?? ""),
    };
  };
}
