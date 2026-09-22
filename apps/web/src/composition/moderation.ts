import { transactionRunner } from "@/infrastructure/database/client";
import { outbox } from "@/infrastructure/outbox";
import { authorize } from "@/modules/auth";
import {
  createClaimReport,
  createDismissReport,
  createFileContentReport,
  createResolveReport,
} from "@/modules/moderation";
import { createPrismaModerationStore } from "@/modules/moderation/server";

/** Wires the moderation module to PostgreSQL (mirrors composition/posts.ts's shape). */
const store = createPrismaModerationStore({
  runner: transactionRunner,
  outbox,
});
const deps = { store, authorize };

export const fileContentReport = createFileContentReport(deps);
export const claimReport = createClaimReport(deps);
export const resolveReport = createResolveReport(deps);
export const dismissReport = createDismissReport(deps);
