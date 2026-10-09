import type { AnnouncementPublishedPayload } from "@nitap/jobs";
import type { JobProcessor } from "@nitap/queue";

import type { DeliverNotification } from "../notifications/deliver.ts";

type Deps = {
  deliver: DeliverNotification;
  /** False when the announcement is gone or removed: nobody is notified about removed content. */
  postIsLive: (postId: string) => Promise<boolean>;
  /** VERIFIED members ordered by id, strictly after `afterId`, at most `limit`. */
  listRecipients: (
    afterId: string | null,
    limit: number
  ) => Promise<{ id: string; email: string }[]>;
  batchSize?: number;
};

/**
 * Every verified member except the author gets an in-app row and, preference
 * permitting, an email. ponytail: one job walks all members; a timed-out run retries from the first batch
 * and deliver() dedupes on (type, job id, recipient). Split into per-batch child jobs if a full walk
 * regularly exceeds FANOUT_TIMEOUT_MS.
 */
export function createAnnouncementPublishedProcessor(
  deps: Deps
): JobProcessor<AnnouncementPublishedPayload> {
  const batchSize = deps.batchSize ?? 500;
  return async (payload, { logger, signal, jobId: eventId }) => {
    logger.info("announcement.published.handled", {
      metadata: { postId: payload.postId, authorId: payload.authorId },
    });
    if (!(await deps.postIsLive(payload.postId))) return;
    let afterId: string | null = null;
    for (;;) {
      const batch = await deps.listRecipients(afterId, batchSize);
      for (const recipient of batch) {
        signal.throwIfAborted(); // timed out: stop, the retry re-walks (deliver dedupes)
        if (recipient.id === payload.authorId) continue;
        await deps.deliver({
          eventId,
          type: "announcement.published",
          category: "ENGAGEMENT",
          recipientId: recipient.id,
          payload: { postId: payload.postId },
          emailTo: recipient.email,
        });
      }
      if (batch.length === 0) return;
      afterId = batch.at(-1)!.id;
    }
  };
}
