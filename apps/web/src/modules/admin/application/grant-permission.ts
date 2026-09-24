import { PERMISSIONS } from "@nitap/database/permissions";

import { NotFoundError, ValidationError } from "@/lib/errors";
import type { Actor } from "@/modules/auth";

import { checkGrantChange } from "../domain/escalation";
import { grantInputSchema } from "../domain/user-query";
import type { AccessStore, GrantRow } from "./access-store";
import { escalationError, guardTarget } from "./access-guards";
import type { Authorize, LoadGrants } from "./authorize-port";
import { toValidationError } from "./validation";

export type GrantDeps = {
  store: AccessStore;
  authorize: Authorize;
  loadGrants: LoadGrants;
  now?: () => Date;
};

const invalid = (field: string, message: string) =>
  new ValidationError({ details: [{ field, code: "INVALID", message }] });

export const grantAuditMetadata = (g: GrantRow) => ({
  grantId: g.id,
  permission: g.permission,
  scope: g.scope,
  chapterId: g.chapterId,
  expiresAt: g.expiresAt?.toISOString() ?? null,
});

/** RBAC §9 permission.granted; E2 and chapter/expiry rules (spec B12-3, B12-4). */
export function createGrantPermission(deps: GrantDeps) {
  return async function grantPermission(args: {
    actor: Actor | null;
    userId: string;
    input: unknown;
  }): Promise<GrantRow> {
    const actor = deps.authorize(args.actor, PERMISSIONS.PERMISSION_GRANT, {
      subjectUserId: args.userId,
      concealed: true,
    });
    const parsed = grantInputSchema.safeParse(args.input);
    if (!parsed.success) throw toValidationError(parsed.error);
    const input = parsed.data;
    const now = (deps.now ?? (() => new Date()))();
    if (input.expiresAt && input.expiresAt <= now)
      throw invalid("expiresAt", "Choose a time in the future.");

    const request = {
      permission: input.permission,
      scope: input.scope,
      chapterId: input.chapterId ?? null,
    };
    const reason = checkGrantChange(actor.grants, request, now);
    if (reason) throw escalationError(reason);
    await guardTarget(deps.loadGrants, actor, args.userId, now);

    return deps.store.transaction(async (tx) => {
      if (!(await tx.findUserForUpdate(args.userId))) throw new NotFoundError();
      if (request.chapterId) {
        const chapter = await tx.findChapter(request.chapterId);
        if (!chapter || chapter.archived)
          throw invalid("chapterId", "Choose an active chapter.");
      }
      const grant = await tx.insertGrant({
        userId: args.userId,
        permission: input.permission as GrantRow["permission"],
        scope: input.scope,
        chapterId: request.chapterId,
        expiresAt: input.expiresAt ?? null,
        grantedBy: actor.userId,
      });
      await tx.audit({
        action: "permission.granted",
        actorId: actor.userId,
        targetUserId: args.userId,
        metadata: grantAuditMetadata(grant),
      });
      return grant;
    });
  };
}
export type GrantPermission = ReturnType<typeof createGrantPermission>;
