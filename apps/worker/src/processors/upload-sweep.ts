import type { UploadSweepPayload } from "@nitap/jobs";
import type { JobProcessor } from "@nitap/queue";
import type { StoragePort } from "@nitap/storage";

export type UploadSweepStoreRow = { id: string; objectKey: string };

export type UploadSweepStore = {
  listExpiredPending(
    before: Date,
    limit: number
  ): Promise<UploadSweepStoreRow[]>;
  remove(id: string): Promise<void>;
};

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Deletes PENDING_UPLOAD rows older than the threshold, and their raw objects best-effort (spec 3C
 * F-3): evidence that never made it past presign. Walks bounded batches until a short one ends the run,
 * so one very large backlog cannot hold the job open past its timeout.
 */
export function createUploadSweepProcessor(deps: {
  store: UploadSweepStore;
  storage: StoragePort;
  olderThanMs?: number;
  batchSize?: number;
  now?: () => Date;
}): JobProcessor<UploadSweepPayload> {
  const olderThanMs = deps.olderThanMs ?? DAY_MS;
  const batchSize = deps.batchSize ?? 500;
  const now = deps.now ?? (() => new Date());

  return async (_payload, context) => {
    const before = new Date(now().getTime() - olderThanMs);
    let removed = 0;

    while (!context.signal.aborted) {
      const batch = await deps.store.listExpiredPending(before, batchSize);
      if (batch.length === 0) break;

      for (const row of batch) {
        try {
          await deps.storage.delete(row.objectKey);
        } catch (error) {
          // Best-effort: the bucket lifecycle rule is the backstop for an object the delete missed.
          context.logger.warn("upload.sweep.object_delete_failed", { error });
        }
        await deps.store.remove(row.id);
        removed += 1;
      }
      if (batch.length < batchSize) break;
    }

    context.logger.info("upload.swept", { metadata: { removed } });
  };
}
