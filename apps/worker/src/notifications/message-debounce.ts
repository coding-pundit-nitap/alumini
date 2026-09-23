import type { Redis } from "ioredis";

import { debounceKeyFor } from "@nitap/jobs";

export type MessageDebounce = {
  /**
   * Atomically claims the email window for (recipient, conversation). Email is at-most-once (best-effort
   * for ENGAGEMENT): the same owner is re-granted on retry, but deliver() dedupes on the in-app insert and
   * returns before any email enqueue, so a crash after the in-app insert loses that email and the key holds
   * for the window. Reading the conversation in the web app deletes the key (N-7).
   */

  tryStart(
    recipientId: string,
    conversationId: string,
    ownerId: string
  ): Promise<boolean>;
};

export function createRedisMessageDebounce(
  redis: Pick<Redis, "set" | "get">,
  windowMs = 5 * 60_000
): MessageDebounce {
  return {
    async tryStart(recipientId, conversationId, ownerId) {
      const key = debounceKeyFor(recipientId, conversationId);
      const result = await redis.set(key, ownerId, "PX", windowMs, "NX");
      return result === "OK" || (await redis.get(key)) === ownerId;
    },
  };
}
