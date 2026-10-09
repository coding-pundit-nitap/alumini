import { PERMISSIONS } from "@nitap/database/permissions";

import { audit } from "@/infrastructure/audit";
import { transactionRunner } from "@/infrastructure/database/client";
import { outbox } from "@/infrastructure/outbox";
import { authorize, type Actor } from "@/modules/auth";
import {
  createClaimReport,
  createDismissReport,
  createFileContentReport,
  createGetReport,
  createListReports,
  createResolveReport,
} from "@/modules/moderation";
import { createPrismaModerationStore } from "@/modules/moderation/server";

const store = createPrismaModerationStore({
  runner: transactionRunner,
  outbox,
  audit,
});
const deps = { store, authorize };

export const fileContentReport = createFileContentReport(deps);
export const claimReport = createClaimReport(deps);
export const resolveReport = createResolveReport(deps);
export const dismissReport = createDismissReport(deps);
export const listReports = createListReports(deps);
export const getReport = createGetReport(deps);

/** Lets PATCH /reports/:id refuse a non-holder (404) before it validates the body. */
export const authorizeReportReview = (actor: Actor | null) =>
  authorize(actor, PERMISSIONS.REPORT_REVIEW, { concealed: true });
