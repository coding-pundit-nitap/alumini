import { transactionRunner } from "@/infrastructure/database/client";
import { outbox } from "@/infrastructure/outbox";

import { createApplyEmailVerification } from "../application/apply-email-verification";
import { createAuthEmailSender } from "../application/auth-emails";
import { createProvisionMember } from "../application/provision-member";
import { createEmailOutbox } from "./email-outbox";
import { getEmailPolicy } from "./email-policy-config";
import { createPrismaMemberStore } from "./prisma-member-store";

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
