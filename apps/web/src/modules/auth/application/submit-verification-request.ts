import {
  AuthorizationError,
  ConflictError,
  NotFoundError,
  RateLimitedError,
} from "@/lib/errors";

import type { Actor } from "../domain/actor";
import type { EmailPolicy } from "../domain/email-policy";
import { SELF_SERVICE_PERMISSIONS } from "../domain/permission";
import {
  submissionBlock,
  verificationTrack,
  type SubmissionBlock,
} from "../domain/verification-request";
import type { Authorization } from "./authorize";
import type { InstituteRecords } from "./institute-records";
import type { RateLimiter, RateRule } from "./rate-limiter";
import type { VerificationStore } from "./verification-store";

/** Proposals for the institute to confirm. */
export const SUBMISSIONS_PER_ACCOUNT: RateRule = {
  windowSeconds: 86_400,
  max: 3,
};
export const SUBMISSIONS_PER_IP: RateRule = { windowSeconds: 86_400, max: 10 };

export type EvidenceInput = {
  rollNumber: string;
  departmentId: string;
  degreeId: string;
  graduationYear: number;
  supportingInfo?: string | null;
};

function errorFor(block: SubmissionBlock): Error {
  switch (block) {
    case "NOT_ELIGIBLE_STATE":
      return new AuthorizationError();
    case "STAFF_TRACK":
      return new AuthorizationError({ code: "VERIFICATION_NOT_APPLICABLE" });
    case "REQUEST_OPEN":
      return new ConflictError("VERIFICATION_REQUEST_OPEN");
    case "LOCKED":
      return new AuthorizationError({ code: "VERIFICATION_LOCKED" });
  }
}

/**
 * The applicant is always the caller. Eligibility is checked before rate limits
 * so a blocked account spends none; a unique index catches concurrent submits.
 */
export function createSubmitVerificationRequest(deps: {
  store: VerificationStore;
  authorize: Authorization["authorize"];
  policy: () => EmailPolicy;
  rateLimiter: RateLimiter;
  instituteRecords: InstituteRecords;
}) {
  return async function submitVerificationRequest(args: {
    actor: Actor | null;
    clientIp: string;
    input: EvidenceInput;
  }): Promise<{ requestId: string }> {
    const caller = deps.authorize(
      args.actor,
      SELF_SERVICE_PERMISSIONS.VERIFICATION_REQUEST
    );

    const standing = await deps.store.transaction(async (tx) => {
      const account = await tx.findAccount(caller.userId);
      if (!account) throw new NotFoundError();
      const latest = await tx.latestRequest(caller.userId);
      return {
        email: account.email,
        hasOpenRequest: latest?.status === "PENDING",
        rejectedCount: await tx.countRejected(caller.userId),
      };
    });

    const block = submissionBlock({
      accountState: caller.accountState,
      track: verificationTrack(standing.email, deps.policy()),
      hasOpenRequest: standing.hasOpenRequest,
      rejectedCount: standing.rejectedCount,
    });
    if (block) throw errorFor(block);

    const limits: [string, RateRule][] = [
      [`verification.submit:user:${caller.userId}`, SUBMISSIONS_PER_ACCOUNT],
      [`verification.submit:ip:${args.clientIp}`, SUBMISSIONS_PER_IP],
    ];
    for (const [key, rule] of limits) {
      const result = await deps.rateLimiter.consume(key, rule);
      if (!result.allowed) {
        throw new RateLimitedError(
          result.retryAfterSeconds ?? rule.windowSeconds
        );
      }
    }

    const { rollNumber, departmentId, degreeId, graduationYear } = args.input;
    const crossCheck = await deps.instituteRecords.check({
      rollNumber,
      departmentId,
      degreeId,
      graduationYear,
    });

    const created = await deps.store.transaction((tx) =>
      tx.createRequest({
        userId: caller.userId,
        rollNumber,
        departmentId,
        degreeId,
        graduationYear,
        supportingInfo: args.input.supportingInfo?.trim() || null,
        crossCheck,
      })
    );
    return { requestId: created.id };
  };
}

export type SubmitVerificationRequest = ReturnType<
  typeof createSubmitVerificationRequest
>;
