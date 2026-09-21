import type { OutboxWriter } from "@nitap/database/outbox";
import { createUploadStore as createDbUploadStore } from "@nitap/database/uploads";

import type { TransactionRunner } from "@/infrastructure/database/transaction-runner";

import type { UploadStore, UploadTx } from "../application/upload-store";

/**
 * Adapts the shared `@nitap/database/uploads` store (also used by the worker) to this module's
 * transaction-scoped port, and writes the `upload.scan` outbox event in the same transaction as the
 * status change (the same shape as `prisma-verification-store.ts`'s `enqueueEmail`).
 */
export function createPrismaUploadStore(deps: {
  runner: Pick<TransactionRunner, "run">;
  outbox: OutboxWriter;
}): UploadStore {
  const db = createDbUploadStore();

  return {
    transaction(work) {
      return deps.runner.run(async (prismaTx) => {
        const tx: UploadTx = {
          find: (id) => db.find(prismaTx, id),
          countOpen: (ownerId) => db.countOpen(prismaTx, ownerId),
          create: (input) => db.create(prismaTx, input),
          markPendingScan: (id) => db.markPendingScan(prismaTx, id),
          enqueueScan: async (payload) => {
            await deps.outbox.add(prismaTx, { type: "upload.scan", payload });
          },
        };
        return work(tx);
      });
    },
  };
}
