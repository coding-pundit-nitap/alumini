import type { Redis } from "ioredis";

import { debounceKeyFor, MESSAGE_DEBOUNCE_MS } from "@nitap/jobs";

export type MessageDebounce = {
  /**
   * Claims or joins the (recipient, conversation) window. The first message's event id opens the window
   * and names it (`window`, the notification's windowBucket); only that event emails (`owner`), and it is
   * re-granted on retry, so a crash after the in-app insert still sends the email on the next attempt. The
   * window ends by TTL, or when reading the conversation in the web app deletes the key.
   */
  claim(
    recipientId: string,
    conversationId: string,
    ownerId: string
  ): Promise<{ owner: boolean; window: string }>;
};

export function createRedisMessageDebounce(
  redis: Pick<Redis, "set" | "get">,
  windowMs = MESSAGE_DEBOUNCE_MS
): MessageDebounce {
  return {
    async claim(recipientId, conversationId, ownerId) {
      const key = debounceKeyFor(recipientId, conversationId);
      // Twice: the key can expire between a losing SET NX and the GET.
      for (let i = 0; i < 2; i++) {
        if ((await redis.set(key, ownerId, "PX", windowMs, "NX")) === "OK")
          return { owner: true, window: ownerId };
        const current = await redis.get(key);
        if (current !== null)
          return { owner: current === ownerId, window: current };
      }
      throw new Error("debounce window churned");
    },
  };
}
