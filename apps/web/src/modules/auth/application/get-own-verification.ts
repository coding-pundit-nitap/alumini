import { NotFoundError } from "@/lib/errors";

import type { Actor } from "../domain/actor";
import type { EmailPolicy } from "../domain/email-policy";
import { SELF_SERVICE_PERMISSIONS } from "../domain/permission";
import {
  MAX_REJECTED_SUBMISSIONS,
  verificationTrack,
  type VerificationStatus,
  type VerificationTrack,
} from "../domain/verification-request";
import type { Authorization } from "./authorize";
import type { VerificationStore } from "./verification-store";

export type OwnVerification = {
  track: VerificationTrack;
  locked: boolean;
  rejectedCount: number;
  latest: {
    status: VerificationStatus;
    rollNumber: string;
    graduationYear: number;
    reviewNote: string | null;
    submittedAt: Date;
    reviewedAt: Date | null;
  } | null;
};

/**
 * What the applicant's own status page shows. It reads only the caller's rows and returns a DTO: no
 * reviewer identity, no other user's data, and never the raw record (TDS §3.4).
 */
export function createGetOwnVerification(deps: {
  store: VerificationStore;
  authorize: Authorization["authorize"];
  policy: () => EmailPolicy;
}) {
  return async function getOwnVerification(args: {
    actor: Actor | null;
  }): Promise<OwnVerification> {
    const caller = deps.authorize(
      args.actor,
      SELF_SERVICE_PERMISSIONS.VERIFICATION_REQUEST
    );

    return deps.store.transaction(async (tx) => {
      const account = await tx.findAccount(caller.userId);
      if (!account) throw new NotFoundError();
      const latest = await tx.latestRequest(caller.userId);
      const rejectedCount = await tx.countRejected(caller.userId);
      return {
        track: verificationTrack(account.email, deps.policy()),
        locked: rejectedCount >= MAX_REJECTED_SUBMISSIONS,
        rejectedCount,
        latest: latest && {
          status: latest.status,
          rollNumber: latest.rollNumber,
          graduationYear: latest.graduationYear,
          reviewNote: latest.reviewNote,
          submittedAt: latest.createdAt,
          reviewedAt: latest.reviewedAt,
        },
      };
    });
  };
}

export type GetOwnVerification = ReturnType<typeof createGetOwnVerification>;
