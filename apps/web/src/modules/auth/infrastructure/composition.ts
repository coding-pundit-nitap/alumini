import { VERIFIED_ALUMNI_ROLE } from "@nitap/database/role-permissions";

import { audit } from "@/infrastructure/audit";
import { prisma, transactionRunner } from "@/infrastructure/database/client";
import { outbox } from "@/infrastructure/outbox";
import { redisRateLimitStorage } from "@/infrastructure/redis/rate-limit-storage";

import { createApplyEmailVerification } from "../application/apply-email-verification";
import { createAuthEmailSender } from "../application/auth-emails";
import { createDecideVerificationRequest } from "../application/decide-verification-request";
import { createGetOwnVerification } from "../application/get-own-verification";
import { createListPendingVerificationRequests } from "../application/list-pending-verification-requests";
import { createProvisionMember } from "../application/provision-member";
import { createSubmitVerificationRequest } from "../application/submit-verification-request";
import { authorize } from "./authorization";
import { createEmailOutbox } from "./email-outbox";
import { getEmailPolicy } from "./email-policy-config";
import { createPrismaMemberStore } from "./prisma-member-store";
import { createPrismaVerificationStore } from "./prisma-verification-store";
import { createRedisRateLimiter } from "./redis-rate-limiter";
import { unavailableInstituteRecords } from "./unavailable-institute-records";

/** The module's real wiring. Tests build the same pieces around a test database instead. */
const memberStore = createPrismaMemberStore(transactionRunner);

export const provisionMember = createProvisionMember({ store: memberStore });

export const applyEmailVerification = createApplyEmailVerification({
  store: memberStore,
  policy: getEmailPolicy,
});

export const authEmails = createAuthEmailSender({
  outbox: createEmailOutbox({ runner: transactionRunner, writer: outbox }),
});

const verificationStore = createPrismaVerificationStore({
  runner: transactionRunner,
  prisma,
  outbox,
  audit,
});

export const submitVerificationRequest = createSubmitVerificationRequest({
  store: verificationStore,
  authorize,
  policy: getEmailPolicy,
  rateLimiter: createRedisRateLimiter(redisRateLimitStorage),
  instituteRecords: unavailableInstituteRecords,
});

// The role an approval grants is injected here: application code never names a role (RBAC §11).
export const decideVerificationRequest = createDecideVerificationRequest({
  store: verificationStore,
  authorize,
  now: () => new Date(),
  approvalRole: VERIFIED_ALUMNI_ROLE,
});

export const listPendingVerificationRequests =
  createListPendingVerificationRequests({
    store: verificationStore,
    authorize,
  });

export const getOwnVerification = createGetOwnVerification({
  store: verificationStore,
  authorize,
  policy: getEmailPolicy,
});
