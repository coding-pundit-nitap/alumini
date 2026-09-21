import {
  AuthorizationError,
  ConflictError,
  NotFoundError,
  ValidationError,
} from "@/lib/errors";

import type { Actor } from "../domain/actor";
import { PERMISSIONS } from "../domain/permission";
import {
  normaliseNote,
  noteProblem,
  REVIEWABLE_ACCOUNT_STATES,
  type VerificationDecision,
} from "../domain/verification-request";
import type { Authorization } from "./authorize";
import type { VerificationStore } from "./verification-store";

export type DecideResult =
  { outcome: "decided" } | { outcome: "already_decided" };

/**
 * A human reviewer approves or rejects a verification request (FR-AUTH-003a). There is no other path
 * to APPROVED. Everything a decision changes happens in ONE transaction, so it commits or rolls back
 * as a whole: request, account state, role, institutional profile fields, audit row and the email.
 *
 * Authorization is the grant check first; the self-review rule is then explicit so the client gets
 * SELF_REVIEW_FORBIDDEN (the DECIDE guardrail and a database CHECK back it). The role is injected:
 * application code names permissions, never roles (RBAC §11).
 */
export function createDecideVerificationRequest(deps: {
  store: VerificationStore;
  authorize: Authorization["authorize"];
  now: () => Date;
  approvalRole: string;
}) {
  return async function decideVerificationRequest(args: {
    actor: Actor | null;
    requestId: string;
    decision: VerificationDecision;
    note?: string | null;
  }): Promise<DecideResult> {
    const reviewer = deps.authorize(args.actor, PERMISSIONS.ALUMNI_VERIFY);

    const note = normaliseNote(args.note);
    const problem = noteProblem(args.decision, note);
    if (problem) {
      throw new ValidationError({
        details: [{ field: "note", code: "INVALID_NOTE", message: problem }],
      });
    }

    return deps.store.transaction(async (tx): Promise<DecideResult> => {
      const request = await tx.findRequest(args.requestId);
      if (!request) throw new NotFoundError();
      if (request.userId === reviewer.userId) {
        throw new AuthorizationError({ code: "SELF_REVIEW_FORBIDDEN" });
      }
      if (request.status !== "PENDING") return { outcome: "already_decided" };

      const decided = await tx.decideRequest({
        id: request.id,
        decision: args.decision,
        reviewerId: reviewer.userId,
        note,
        now: deps.now(),
      });
      if (!decided) return { outcome: "already_decided" };

      const target = args.decision === "APPROVED" ? "VERIFIED" : "REJECTED";
      const moved = await tx.setAccountState(
        request.userId,
        REVIEWABLE_ACCOUNT_STATES,
        target
      );
      // A suspended or deactivated account is not for this queue to change (Phase 12 tooling). Throwing
      // rolls the decision back, so the request stays queued.
      if (!moved) throw new ConflictError("ACCOUNT_NOT_REVIEWABLE");

      if (args.decision === "APPROVED") {
        const to = {
          departmentId: request.departmentId,
          degreeId: request.degreeId,
          graduationYear: request.graduationYear,
        };
        const from = await tx.applyInstitutionalFields(request.userId, to);
        // RBAC §12: institutional changes are audited with old and new values (FR-PROFILE-004).
        await tx.recordAudit({
          actorId: reviewer.userId,
          action: "profile.institutional_changed",
          targetType: "profile",
          targetId: request.userId,
          metadata: { from, to },
        });
        await tx.assignRole(request.userId, deps.approvalRole, reviewer.userId);
      }

      const account = await tx.findAccount(request.userId);
      if (!account) throw new NotFoundError();
      await tx.enqueueEmail({
        v: 1,
        to: account.email,
        template:
          args.decision === "APPROVED"
            ? "verification-approved"
            : "verification-rejected",
        params: {},
      });
      await tx.recordAudit({
        actorId: reviewer.userId,
        action:
          args.decision === "APPROVED" ? "alumni.verified" : "alumni.rejected",
        targetType: "user",
        targetId: request.userId,
        metadata: { requestId: request.id, crossCheck: request.crossCheck },
      });
      return { outcome: "decided" };
    });
  };
}

export type DecideVerificationRequest = ReturnType<
  typeof createDecideVerificationRequest
>;
