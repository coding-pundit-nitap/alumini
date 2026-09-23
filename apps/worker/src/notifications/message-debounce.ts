import type { Redis } from "ioredis";

import { debounceKeyFor } from "@nitap/jobs";

export type MessageDebounce = {
  /**
   * Atomically claims the email window for (recipient, conversation). True for the claimant, and again for the
   * SAME owner (a retry of the event that claimed it, so a crash before enqueue never loses the email; deliver's
   * dedupeKey stops a second send). False while another event's window is open.
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
