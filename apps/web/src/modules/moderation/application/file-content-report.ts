import { PERMISSIONS } from "@nitap/database/permissions";
import type { ReportFiledPayload } from "@nitap/jobs";

import { NotFoundError } from "@/lib/errors";
import type { Actor } from "@/modules/auth";

import { reportContentInput } from "../domain/moderation";
import type { Authorize } from "./authz";
import type { ModerationStore } from "./moderation-store";
import { parse } from "./validation";

/** Filing is idempotent per (reporter, target); a nonexistent target is refused NOT_FOUND. */
export function createFileContentReport(deps: {
  store: ModerationStore;
  authorize: Authorize;
}) {
  return async function fileContentReport(args: {
    actor: Actor | null;
    input: unknown;
  }): Promise<{ reportId: string; created: boolean }> {
    const caller = deps.authorize(args.actor, PERMISSIONS.REPORT_CREATE);
    const input = parse(reportContentInput, args.input);
    const reporterId = caller.userId.toLowerCase();

    const result = await deps.store.transaction(async (tx) => {
      const contentAuthorId = await tx.contentAuthor(
        input.targetType,
        input.targetId
      );
      if (!contentAuthorId) throw new NotFoundError();
      const inserted = await tx.insertReport({
        reporterId,
        targetType: input.targetType,
        targetId: input.targetId,
        reason: input.reason,
      });
      if (inserted.created) {
        await tx.enqueue({
          type: "report.filed",
          payload: {
            v: 1,
            reportId: inserted.id,
            targetType: input.targetType,
            targetId: input.targetId,
            reporterId,
          } satisfies ReportFiledPayload,
        });
      }
      return inserted;
    });
    return { reportId: result.id, created: result.created };
  };
}
